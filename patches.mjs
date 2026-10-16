import {patchPickerSections} from './picker-sections.mjs';
import {patchSubagentBubbles} from './subagent-bubbles.mjs';
import {patchSubagentLifecycle} from './subagent-lifecycle.mjs';
import {patchConversationActionsWorkbench, patchConversationActionsRuntime} from './conversation-actions.mjs';
import {patchSubagentModel} from './subagent-model.mjs';
import {patchSubagentSettingsWorkbench, patchSubagentSettingsRuntime} from './subagent-settings.mjs';
import {patchMaxMode} from './max-mode.mjs';
import {patchAgentHost} from './agent-host.mjs';
import {pickerModels, prefix} from './models.mjs';

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function once(source, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Unsupported or repeated patch anchor (${count} matches): ${before.slice(0, 100)}`);
  return source.replace(before, () => after);
}

function onlyMatch(source, pattern, label) {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`${label} anchor is not unique (${matches.length} matches)`);
  return matches[0];
}

// The models agy listed at install time; the bridge serves the same catalog.
export function workbenchPrelude({port, key}, catalog) {
  return `
/* cursor-gemini-link: models run by the local Antigravity CLI */
var __antigravityModels=${JSON.stringify(pickerModels(catalog))};
const __antigravityBridgeBase=${JSON.stringify('http://127.0.0.1:' + port)},__antigravityBridgeKey=${JSON.stringify(key)};
function __isAntigravityModel(m){return typeof m==="string"&&m.startsWith(${JSON.stringify(prefix)})}
function __withAntigravityModels(models){return [...models.filter(m=>!__isAntigravityModel(m.name)),...__antigravityModels]}
`;
}

// Returned for Antigravity models before Cursor's own provider resolution. agy
// signs in by itself, so the bridge needs only its own local key.
export function providerConfigBranch(modelExpression) {
  return `if(__isAntigravityModel(${modelExpression}))return{baseUrl:__antigravityBridgeBase+"/v1",apiKey:__antigravityBridgeKey,customHeaders:{}};`;
}

export function patchWorkbench(source, surface, symbols, config, catalog, {remoteTunnel = false} = {}) {
  if (!['desktop', 'glass'].includes(surface)) throw new Error('Unknown workbench surface: ' + surface);
  // The declaration, not the name: a companion's picker section may mention
  // this constant defensively when it renders the usage label.
  if (source.includes('const __antigravityBridgeBase=')) throw new Error('Antigravity patch marker already present.');
  const s = symbols;
  source = workbenchPrelude(config, catalog) + source;
  source = patchPickerSections(source, once, s);

  // The default model list, possibly already wrapped by cursor-gpt-link or cursor-claude-link.
  const getter = onlyMatch(source, /getAvailableDefaultModels\(\)\{return ?((?:__with[\w$]+\()*\[\.\.\.this\._availableDefaultModels\(\)\]\)*)\}/g, 'Default model getter');
  source = once(source, getter[0], `getAvailableDefaultModels(){return __withAntigravityModels(${getter[1]})}`);
  const mapper = new RegExp(escapeRegex(s.mapPrefix) + escapeRegex(s.mapVar) + '=((?:__with[\\w$]+\\()*' + escapeRegex(s.mapVar) + '\\)*)\\.map\\(' + escapeRegex(s.mapper) + '\\)', 'g');
  const map = onlyMatch(source, mapper, 'Default model mapping');
  source = once(source, map[0], `${s.mapPrefix}${s.mapVar}=__withAntigravityModels(${map[1]}).map(${s.mapper})`);

  const provider = onlyMatch(source, /async getLocalAgentProviderConfig\(([\w$]+),([\w$]+)\)\{/g, 'Provider configuration');
  source = once(source, provider[0], provider[0] + providerConfigBranch(`${provider[2]}?.requestedModel?.modelId??${provider[1]}?.modelId`));

  // Route Antigravity requests through the local agent runtime.
  // The run signature names the request options (11th) and model (4th).
  const params = s.runAnchor.match(/^async run\(([\w$,]+)\)/)?.[1].split(',');
  if (!params || params.length < 11) throw new Error('Unrecognised run signature: ' + s.runAnchor.slice(0, 60));
  const requested = `${params[10]}?.requestedModel?.modelId??${params[3]}?.modelId`;
  // A companion already switched this gate; join its condition.
  const companion = ['__chatgptLocal', '__claudeLocal', '__mercuryLocal'].find(name => source.includes(`const ${name}=`));
  if (companion) source = once(source, `const ${companion}=`, `const ${companion}=__isAntigravityModel(${requested})||`);
  else {
    const local = s.localMode;
    source = once(source, s.runAnchor, s.runAnchor
      .replace('{const ', `{const __antigravityLocal=__isAntigravityModel(${requested});const `)
      .replace(`localMode:${local}.localMode})`, `localMode:${local}.localMode||__antigravityLocal})`)
      .replace(`if(${local}.localMode){`, `if(${local}.localMode||__antigravityLocal){`));
  }
  // Remote SSH: builds up to 3.22.5 kept the agent in the dedicated UI runtime
  // so the bridge stayed reachable. That runtime resolves paths with the
  // client's own path module, so a Windows client turned the host's "/srv/app"
  // into "C:\srv\app". From 3.22.9 the agent runs on the SSH host, as Cursor
  // intends, and reaches the bridge through an ssh reverse forward.
  if (!remoteTunnel) {
    const dedicated = `${s.host}(this.storageService,"useDedicatedLocalAgentRuntimeHost")`;
    source = once(source, dedicated, `(__isAntigravityModel(${s.hostModelVar})&&Boolean(this.environmentService.remoteAuthority)||${dedicated})`);
    if (source.includes(s.activation)) source = once(source, s.activation, s.activation.replace('return ', 'return typeof __antigravityBridgeBase==="string"||'));
  }

  source = patchMaxMode(patchSubagentSettingsWorkbench(source));
  source = patchSubagentBubbles(source, surface, s);
  source = patchSubagentLifecycle(source, surface, prefix, s);
  source = patchAgentHost(patchConversationActionsWorkbench(source, surface, prefix));
  return source;
}

// The runtime maps the picker's Effort to reasoning_effort; the bridge turns it
// into agy's model slug for that effort.
export function antigravityReasoningBranch(params) {
  return `if(typeof t==="string"&&t.startsWith(${JSON.stringify(prefix)})){const selected=${params}?.find(p=>p.id==="reasoning")?.value;if(selected!==undefined)e.reasoning_effort=selected;delete e.reasoning;delete e.service_tier;return}`;
}

export function patchRuntime(source) {
  if (source.includes(`t.startsWith(${JSON.stringify(prefix)})`)) throw new Error('Antigravity runtime patch already present.');
  const effort = onlyMatch(source, /"none"===([\w$]+)\?void 0:\1\}\(([\w$]+)\);/g, 'Reasoning effort');
  source = once(source, effort[0], effort[0] + antigravityReasoningBranch(effort[2]));
  source = patchSubagentSettingsRuntime(patchSubagentModel(source));
  return patchConversationActionsRuntime(source, prefix);
}
