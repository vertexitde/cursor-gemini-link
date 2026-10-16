// Cursor 3.25 can run every chat through its new agent host instead of the
// classic agent path. It decides once per window, from a server-side
// experiment (cursor_agent_host) or private inference, and the agent host
// talks to Cursor's backend directly, so local models never reach the local
// runtime: Cursor answers "Unknown model ID". Users outside the experiment get
// the classic path, which the links route; keep every window on it. Each link
// applies this, and the marker makes the second one a no-op.
export const agentHostMarker = '/*cursor-links: classic agent path*/';

export function patchAgentHost(source) {
  if (source.includes(agentHostMarker)) return source;
  const matches = [...source.matchAll(/this\._agentHostEnabled=\(([\w$]+)\|\|([\w$]+)\)&&([\w$]+),/g)];
  // From 3.24 the window also asks about private inference and the remote
  // workspace policy. Earlier builds, reviewed as they are, stay untouched;
  // verify-build checks that a supported build from 3.24 on carries the marker.
  if (!matches.length) return source;
  if (matches.length !== 1) throw new Error('Agent host enablement anchor is not unique');
  const [anchor, gate, privateInference, policy] = matches[0];
  return source.replace(anchor, () => `this._agentHostEnabled=${agentHostMarker}!1&&(${gate}||${privateInference})&&${policy},`);
}
