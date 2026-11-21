import test from 'node:test';
import assert from 'node:assert/strict';
import {partialText, textStreamer, chunkWriter} from '../stream-text.mjs';

const B = String.fromCharCode(92);

test('the reply text is read out of a JSON answer that is still arriving', () => {
  assert.equal(partialText('{"text":"Hal'), 'Hal');
  assert.equal(partialText('```json\n{\n  "text": "Hallo"'), 'Hallo');
  assert.equal(partialText('{"text":"a' + B + 'nb ' + B + '"c' + B + '" ' + B + 'u00fc'), 'a\nb "c" ü');
  assert.equal(partialText('{"text":"x' + B), 'x', 'a split escape waits');
  assert.equal(partialText('{"tool_calls":[],"text":"spät"}'), 'spät');
  assert.equal(partialText('{"tool_calls":[{"name":"Write","arguments":"{' + B + '"text' + B + '":1}"}]'), '', 'escaped keys inside arguments do not count');
});

test('pieces stream once, and a retry that differs stops the stream', () => {
  const got = [];
  const s = textStreamer(d => got.push(d));
  for (const chunk of ['{"te', 'xt":"Hal', 'lo', ' Welt","tool_calls":[]}']) s.push(chunk);
  assert.deepEqual(got, ['Hal', 'lo', ' Welt']);
  s.restart();
  s.push('{"text":"Hallo Welt, und mehr"}');
  assert.deepEqual(got.at(-1), ', und mehr', 'a retry that repeats the start continues');
  s.restart();
  s.push('{"text":"Etwas anderes"}');
  assert.equal(got.length, 4, 'a different retry shows nothing more');
});

test('the chunk writer sends role, pieces and only the rest at the end', () => {
  const out = [];
  const w = chunkWriter(c => out.push(c), {id:'x', object:'chat.completion.chunk', created:1, model:'m'});
  w.start(); w.reasoning('hm'); w.text('Hal');
  w.finish({choices:[{message:{content:'Hallo', tool_calls:[{id:'c', type:'function', function:{name:'Read', arguments:'{}'}}]}, finish_reason:'tool_calls'}], usage:{total_tokens:3}}, true);
  const deltas = out.filter(c => c.choices.length).map(c => c.choices[0].delta);
  assert.deepEqual(deltas.slice(0, 4), [{role:'assistant'}, {reasoning_content:'hm'}, {content:'Hal'}, {content:'lo'}]);
  assert.equal(deltas[4].tool_calls[0].function.name, 'Read');
  assert.equal(out.at(-2).choices[0].finish_reason, 'tool_calls');
  assert.deepEqual(out.at(-1).usage, {total_tokens:3});
});
