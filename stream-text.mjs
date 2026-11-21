// Streaming for links whose model answers with one JSON object
// {"text": string, "tool_calls": [...]}: the reply text is shown while that
// object is still being written. Shared by cursor-kimi-link and
// cursor-gemini-link; keep the copies identical.

// Decodes as much of the "text" string as has arrived. A trailing partial
// escape waits for the next chunk; keys inside tool arguments are escaped and
// never match.
export function partialText(json) {
  const start = String(json).match(/(?:^|[{,])\s*"text"\s*:\s*"/);
  if (!start) return '';
  let out = '';
  for (let i = start.index + start[0].length; i < json.length; i++) {
    const ch = json[i];
    if (ch === '"') return out;
    if (ch !== '\\') { out += ch; continue; }
    const next = json[i + 1];
    if (next === undefined) return out;
    if (next === 'u') {
      const hex = json.slice(i + 2, i + 6);
      if (hex.length < 4) return out;
      const code = parseInt(hex, 16);
      // A high surrogate waits for its pair.
      if (code >= 0xd800 && code <= 0xdbff && json.slice(i + 6, i + 8) !== '\\u') return out;
      out += String.fromCharCode(code); i += 5; continue;
    }
    out += {n:'\n', t:'\t', r:'\r', b:'\b', f:'\f'}[next] ?? next; i++;
  }
  return out;
}

// Feed it the raw answer as it grows (restart() for a new attempt); it calls
// onText with each new piece of the reply. A retry streams on only while it
// repeats what was already shown, so nothing shown is ever contradicted.
export function textStreamer(onText) {
  let raw = '', shown = '', diverged = false;
  return {
    push(chunk) {
      raw += chunk;
      if (diverged) return;
      const text = partialText(raw);
      if (text.length <= shown.length) return;
      if (!text.startsWith(shown)) { diverged = true; return; }
      const delta = text.slice(shown.length);
      shown = text;
      onText(delta);
    },
    restart() { raw = ''; },
    get shown() { return shown; },
  };
}

// Chat completion chunks for a bridge that streams: the role goes out first,
// then reasoning and text pieces as they arrive; finish() sends the rest of
// the final text, the tool calls, the finish reason and the usage.
export function chunkWriter(write, base) {
  let started = false, streamed = '';
  const chunk = (delta, finish = null) => write({...base, choices:[{index:0, delta, finish_reason:finish}]});
  const start = () => { if (!started) { started = true; chunk({role:'assistant'}); } };
  return {
    start,
    reasoning(delta) { if (!delta) return; start(); chunk({reasoning_content:delta}); },
    text(delta) { if (!delta) return; start(); streamed += delta; chunk({content:delta}); },
    finish(result, includeUsage) {
      start();
      const message = result.choices[0].message;
      const content = message.content ?? '';
      if (content.startsWith(streamed) && content.length > streamed.length) chunk({content:content.slice(streamed.length)});
      (message.tool_calls ?? []).forEach((call, index) => chunk({tool_calls:[{index, ...call}]}));
      chunk({}, result.choices[0].finish_reason);
      if (includeUsage) write({...base, choices:[], usage:result.usage});
    },
  };
}
