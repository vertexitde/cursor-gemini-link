// Local connection between Cursor's agent runtime and the Antigravity CLI.
// Cursor speaks OpenAI chat completions; every request becomes one agy turn.
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {providerModels} from './models.mjs';
import {AgyError, infer, discoverModels, findAgy, newCallId} from './agy.mjs';

const maxBody = 64 * 1024 * 1024;

export const errorBody = (message, code, type = 'invalid_request_error') => ({error:{message, type, param:null, code}});

const send = (response, status, body) => {
  if (response.headersSent) return response.end();
  response.writeHead(status, {'content-type':'application/json'});
  response.end(JSON.stringify(body));
};

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > maxBody) { reject(new AgyError(413, 'Request body is too large.', 'body_too_large', 'invalid_request_error')); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function authorized(request, bridgeKey) {
  const given = Buffer.from(String(request.headers.authorization ?? ''));
  const expected = Buffer.from('Bearer ' + bridgeKey);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// agy counts its own instructions as input; thinking is part of the output.
export function chatUsage(usage) {
  const prompt = usage.input_tokens ?? 0, completion = (usage.output_tokens ?? 0) + (usage.thinking_tokens ?? 0);
  return {prompt_tokens:prompt, completion_tokens:completion, total_tokens:prompt + completion,
    prompt_tokens_details:{cached_tokens:usage.cache_read_tokens ?? 0},
    completion_tokens_details:{reasoning_tokens:usage.thinking_tokens ?? 0}};
}

export function completion(body, answer, usage) {
  const calls = answer.tool_calls.map(call => ({id:newCallId(), type:'function', function:{name:call.name, arguments:call.arguments}}));
  return {id:'chatcmpl-' + crypto.randomBytes(12).toString('hex'), object:'chat.completion', created:Math.floor(Date.now() / 1000), model:body.model,
    choices:[{index:0, message:{role:'assistant', content:answer.text || (calls.length ? null : ''), ...(calls.length ? {tool_calls:calls} : {})},
      finish_reason:calls.length ? 'tool_calls' : 'stop'}],
    usage:chatUsage(usage)};
}

// The whole answer arrives at once, so the stream carries it in a few chunks:
// role, text, one chunk per tool call, the finish reason and, when asked, usage.
export function streamChunks(body, result) {
  const base = {id:result.id, object:'chat.completion.chunk', created:result.created, model:result.model};
  const message = result.choices[0].message, chunks = [];
  chunks.push({...base, choices:[{index:0, delta:{role:'assistant'}, finish_reason:null}]});
  if (message.content) chunks.push({...base, choices:[{index:0, delta:{content:message.content}, finish_reason:null}]});
  (message.tool_calls ?? []).forEach((call, index) => chunks.push({...base, choices:[{index:0, delta:{tool_calls:[{index, ...call}]}, finish_reason:null}]}));
  chunks.push({...base, choices:[{index:0, delta:{}, finish_reason:result.choices[0].finish_reason}]});
  if (body.stream_options?.include_usage) chunks.push({...base, choices:[], usage:result.usage});
  return chunks;
}

async function chat(request, response, state) {
  let body;
  try { body = JSON.parse(await readBody(request)); } catch (error) {
    if (error instanceof AgyError) throw error;
    throw new AgyError(400, 'Request body is not valid JSON.', 'invalid_json', 'invalid_request_error');
  }
  const abort = new AbortController();
  response.on('close', () => { if (!response.writableFinished) abort.abort(); });
  let keepAlive;
  if (body.stream) {
    // agy answers in one piece; comments keep the connection open meanwhile.
    response.writeHead(200, {'content-type':'text/event-stream', 'cache-control':'no-cache', connection:'keep-alive'});
    keepAlive = setInterval(() => response.write(': waiting for Antigravity\n\n'), 10000);
  }
  try {
    const {answer, usage} = await state.infer(state.agy, body, await state.catalog(), {signal:abort.signal});
    const result = completion(body, answer, usage);
    if (!body.stream) return send(response, 200, result);
    for (const chunk of streamChunks(body, result)) response.write('data: ' + JSON.stringify(chunk) + '\n\n');
    response.end('data: [DONE]\n\n');
  } catch (error) {
    if (!body.stream || error?.name === 'AbortError') throw error;
    // Headers are gone; report the failure inside the stream.
    response.write('data: ' + JSON.stringify(errorBody(error.message, error.code ?? 'bridge_error', error.type ?? 'api_error')) + '\n\n');
    response.end('data: [DONE]\n\n');
  } finally {
    clearInterval(keepAlive);
  }
}

export function createBridge({bridgeKey, agy, catalog, inferImpl = infer}) {
  // The catalog is the one recorded at install time until agy has been asked
  // again; a failed refresh keeps the recorded list.
  let current = catalog, refreshing;
  const state = {agy, infer:inferImpl, catalog:async () => current};
  state.refresh = () => refreshing ??= discoverModels(agy).then(list => { current = list; }, () => {}).finally(() => { refreshing = undefined; });
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    try {
      if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, {ok:true, name:'cursor-gemini-link'});
      if (!authorized(request, bridgeKey)) return send(response, 401, errorBody('Unauthorized bridge request.', 'bridge_unauthorized', 'authentication_error'));
      if (request.method === 'GET' && url.pathname === '/v1/models') return send(response, 200, {object:'list', data:providerModels(current)});
      if (request.method === 'POST' && url.pathname === '/v1/chat/completions') return await chat(request, response, state);
      return send(response, 404, errorBody('Not found.', 'not_found'));
    } catch (error) {
      if (error?.name === 'AbortError') return response.destroy();
      const status = error instanceof AgyError ? error.status : 502;
      return send(response, status, errorBody(error?.message ?? String(error), error?.code ?? 'bridge_error', error?.type ?? 'api_error'));
    }
  });
  server.refreshCatalog = state.refresh;
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const config = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(new URL('./catalog.json', import.meta.url), 'utf8'));
  const server = createBridge({bridgeKey:config.key, agy:config.agy ?? findAgy(), catalog});
  server.listen(config.port, '127.0.0.1', () => server.refreshCatalog());
}
