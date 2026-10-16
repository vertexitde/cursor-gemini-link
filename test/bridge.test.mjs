import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {prepareRequest, answerSchema, validateAnswer, parseEvents, infer} from '../agy.mjs';
import {createBridge, completion, streamChunks} from '../bridge.mjs';
import {sampleCatalog} from '../scripts/checks/sample-models.mjs';

const tools = [{type:'function', function:{name:'read_file', description:'Read a file', parameters:{type:'object', properties:{path:{type:'string'}}, required:['path']}}},
  {type:'function', function:{name:'run_terminal_cmd', parameters:{type:'object'}}}];
const base = {model:'antigravity/gemini-4-argon', tools, messages:[{role:'system', content:'Be helpful.'}, {role:'user', content:'hi'}]};
const workspace = () => fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-'));

test('a request becomes one JSON prompt with the agent instructions, conversation and tools', () => {
  const dir = workspace();
  try {
    const request = prepareRequest({...base, reasoning_effort:'high', messages:[...base.messages,
      {role:'assistant', content:null, tool_calls:[{id:'c1', type:'function', function:{name:'read_file', arguments:'{"path":"a"}'}}]},
      {role:'tool', tool_call_id:'c1', content:'file body'}]}, sampleCatalog, dir);
    assert.equal(request.slug, 'gemini-4-argon-high');
    const payload = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n\n') + 2));
    assert.equal(payload.agentInstructions, 'Be helpful.');
    assert.deepEqual(payload.conversation.map(m => m.role), ['user', 'assistant', 'tool']);
    assert.deepEqual(payload.conversation[1].tool_calls, [{id:'c1', name:'read_file', arguments:'{"path":"a"}'}]);
    assert.equal(payload.conversation[2].tool_call_id, 'c1');
    assert.deepEqual(payload.availableTools.map(t => t.name), ['read_file', 'run_terminal_cmd']);
    assert.match(request.prompt, /Do not use any of your own tools/);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

test('inline images are written to the working folder and referenced by name', () => {
  const dir = workspace();
  try {
    const png = Buffer.from([137, 80, 78, 71]).toString('base64');
    const request = prepareRequest({...base, messages:[{role:'user', content:[{type:'text', text:'look'},
      {type:'image_url', image_url:{url:'data:image/png;base64,' + png}}, {type:'image_url', image_url:{url:'https://example.com/x.png'}}]}]}, sampleCatalog, dir);
    assert.equal(request.attachments, 1);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'attachment-1.png')), Buffer.from([137, 80, 78, 71]));
    assert.match(request.prompt, /\[Attached image: attachment-1\.png\]/);
    assert.match(request.prompt, /Image omitted/);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

test('the answer schema follows tool_choice and parallel_tool_calls', () => {
  const list = [{name:'a'}, {name:'b'}];
  const calls = body => answerSchema(body, list).properties.tool_calls;
  assert.deepEqual(calls({}).items.properties.name.enum, ['a', 'b']);
  assert.equal(calls({tool_choice:'required'}).minItems, 1);
  assert.equal(calls({tool_choice:'none'}).maxItems, 0);
  assert.equal(calls({parallel_tool_calls:false}).maxItems, 1);
  const forced = calls({tool_choice:{type:'function', function:{name:'b'}}});
  assert.deepEqual([forced.minItems, forced.items.properties.name.enum], [1, ['b']]);
  assert.equal(answerSchema({}, []).properties.tool_calls.maxItems, 0, 'no tools, no calls');
});

test('answers are checked against the tools Cursor offered', () => {
  const dir = workspace();
  try {
    const request = prepareRequest(base, sampleCatalog, dir);
    assert.deepEqual(validateAnswer({text:'x', tool_calls:[{name:'read_file', arguments:'{"path":"a"}', extra:1}]}, request, base),
      {text:'x', tool_calls:[{name:'read_file', arguments:'{"path":"a"}'}]});
    assert.throws(() => validateAnswer({text:'x', tool_calls:[{name:'delete_everything', arguments:'{}'}]}, request, base), /unavailable tool/);
    assert.throws(() => validateAnswer({text:'x', tool_calls:[{name:'read_file', arguments:'[1]'}]}, request, base), /JSON object/);
    assert.throws(() => validateAnswer({text:'x', tool_calls:[{name:'read_file', arguments:'nope'}]}, request, base), /invalid tool arguments/);
    assert.throws(() => validateAnswer({tool_calls:[]}, request, base), /structured response/);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

test('agy events: the result carries the answer, failures become errors', () => {
  const ok = ['{"event":"init"}', '{"event":"step_update","step_update":{}}',
    JSON.stringify({event:'result', result:{status:'SUCCESS', response:'{"text":"hi","tool_calls":[]}', usage:{input_tokens:3}}})].join('\n');
  assert.deepEqual(parseEvents(ok).answer, {text:'hi', tool_calls:[]});
  assert.throws(() => parseEvents(JSON.stringify({event:'result', result:{status:'ERROR', error:'quota exhausted'}})), /quota exhausted/);
  assert.throws(() => parseEvents('{"event":"init"}'), /without a result/);
});

function fakeAgy(result, seen) {
  return (command, args, options) => {
    seen.push({command, args, options, files:fs.readdirSync(options.cwd)});
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    let input = '';
    child.stdin.on('data', chunk => { input += chunk; });
    child.stdin.on('finish', () => {
      seen.at(-1).input = JSON.parse(input);
      child.stdout.end(JSON.stringify({event:'result', result}) + '\n');
      setImmediate(() => child.emit('close', 0));
    });
    child.kill = () => {};
    return child;
  };
}

test('infer runs agy in a private folder with the schema and the selected effort', async () => {
  const seen = [];
  const answer = {text:'', tool_calls:[{name:'read_file', arguments:'{"path":"x"}'}]};
  const out = await infer('agy.exe', {...base, reasoning_effort:'low'}, sampleCatalog,
    {spawnProcess:fakeAgy({status:'SUCCESS', response:JSON.stringify(answer), usage:{input_tokens:10, output_tokens:2}}, seen)});
  assert.deepEqual(out.answer, answer);
  assert.equal(out.slug, 'gemini-4-argon-low');
  const [{args, options, input, files}] = seen;
  assert.deepEqual(args.slice(0, 2), ['--model', 'gemini-4-argon-low']);
  for (const flag of ['--input-format', '--output-format', '--json-schema', '--disable-slash-commands', '--sandbox']) assert.ok(args.includes(flag), flag);
  assert.deepEqual(files, ['.answer-schema.json']);
  assert.equal(input.event, 'user');
  assert.equal(input.message.content[0].type, 'text');
  assert.equal(fs.existsSync(options.cwd), false, 'the working folder is removed afterwards');
});

test('completions carry text, tool calls and usage in OpenAI shape, streamed or not', () => {
  const result = completion(base, {text:'Reading it.', tool_calls:[{name:'read_file', arguments:'{"path":"x"}'}]},
    {input_tokens:100, output_tokens:5, thinking_tokens:7, cache_read_tokens:20});
  const message = result.choices[0].message;
  assert.equal(result.choices[0].finish_reason, 'tool_calls');
  assert.equal(message.content, 'Reading it.');
  assert.match(message.tool_calls[0].id, /^call_[0-9a-f]{24}$/);
  assert.deepEqual(message.tool_calls[0].function, {name:'read_file', arguments:'{"path":"x"}'});
  assert.deepEqual(result.usage, {prompt_tokens:100, completion_tokens:12, total_tokens:112,
    prompt_tokens_details:{cached_tokens:20}, completion_tokens_details:{reasoning_tokens:7}});
  const chunks = streamChunks({...base, stream_options:{include_usage:true}}, result);
  assert.deepEqual(chunks.map(c => Object.keys(c.choices[0]?.delta ?? {usage:1})), [['role'], ['content'], ['tool_calls'], [], ['usage']]);
  assert.equal(chunks[2].choices[0].delta.tool_calls[0].index, 0);
  assert.equal(completion(base, {text:'done', tool_calls:[]}, {}).choices[0].finish_reason, 'stop');
});

async function withBridge(options, run) {
  const server = createBridge({bridgeKey:'k', agy:'agy.exe', catalog:sampleCatalog, ...options});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run('http://127.0.0.1:' + server.address().port); } finally { server.close(); }
}

test('the bridge requires its key and lists the Antigravity models', async () => {
  await withBridge({}, async url => {
    assert.equal((await fetch(url + '/health')).status, 200);
    assert.equal((await fetch(url + '/v1/models')).status, 401);
    const models = await (await fetch(url + '/v1/models', {headers:{authorization:'Bearer k'}})).json();
    assert.deepEqual(models.data.map(m => m.id), sampleCatalog.map(m => 'antigravity/' + m.id));
  });
});

test('the bridge answers chat completions, streamed and not, and reports failures', async () => {
  const answer = {text:'Hallo', tool_calls:[]};
  const inferImpl = async (agy, body) => {
    if (body.messages[0].content === 'fail') throw Object.assign(new Error('Antigravity failed: quota'), {status:502, code:'agy_error'});
    return {answer, usage:{input_tokens:1, output_tokens:1}};
  };
  await withBridge({inferImpl}, async url => {
    const post = body => fetch(url + '/v1/chat/completions', {method:'POST', headers:{authorization:'Bearer k'}, body:JSON.stringify(body)});
    const plain = await (await post({model:'antigravity/gemini-4-argon', messages:[{role:'user', content:'hi'}]})).json();
    assert.equal(plain.choices[0].message.content, 'Hallo');
    const streamed = await (await post({model:'antigravity/gemini-4-argon', stream:true, messages:[{role:'user', content:'hi'}]})).text();
    assert.match(streamed, /"content":"Hallo"/);
    assert.ok(streamed.trim().endsWith('data: [DONE]'));
    const failed = await post({model:'antigravity/gemini-4-argon', messages:[{role:'user', content:'fail'}]});
    assert.equal(failed.status, 502);
    assert.match((await failed.json()).error.message, /quota/);
    const failedStream = await (await post({model:'antigravity/gemini-4-argon', stream:true, messages:[{role:'user', content:'fail'}]})).text();
    assert.match(failedStream, /"error":\{"message":"Antigravity failed: quota"/);
  });
});
