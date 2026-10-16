import assert from 'node:assert/strict';
import {agentHostMarker} from '../../agent-host.mjs';

// Run Cursor's own agent-host enablement with the experiment switched on: the
// patched window stays on the classic agent path, the unpatched one would not.
export function verifyAgentHost(source) {
  const at = source.indexOf(agentHostMarker);
  assert.ok(at >= 0, 'Agent host enablement patched');
  const end = 'isCursorAgentHostEnabled(){return this._agentHostEnabled}}';
  const start = source.lastIndexOf('class{constructor(', at), stop = source.indexOf(end, at) + end.length;
  assert.ok(start >= 0 && stop > at, 'Agent host enablement class found');
  const scope = new Proxy({}, {has:() => true, get:(target, key) => key === Symbol.unscopables ? undefined : {localMode:false}});
  const build = text => new Function('__scope', 'with(__scope){return (' + text + ')}')(scope);
  const args = [{checkFeatureGate:() => true}, {info() {}, error() {}}, {decision:{allowed:true}}, {isGlass:false}, {enablement:'disabled'}];
  const patched = build(source.slice(start, stop)), native = build(source.slice(start, stop).replace(agentHostMarker + '!1&&', ''));
  assert.equal(new native(...args).isCursorAgentHostEnabled(), true, 'the experiment would move the window to the agent host');
  assert.equal(new patched(...args).isCursorAgentHostEnabled(), false, 'the window keeps the classic agent path');
  console.log('Native agent host: experiment reproduced; the window keeps the classic agent path.');
}
