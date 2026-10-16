// Opt-in local verification. Patches ORIGINAL bundles (standalone install) and,
// optionally, bundles already patched by cursor-gpt-link, cursor-claude-link
// and cursor-mercury-link (combined install), then executes the new code paths with stubs.
// Cursor's bundled code is read locally and never included in this repository.
//
//   node scripts/verify-build.mjs --original <resources/app | companion backup dir> [--combined <resources/app>] [--version 3.21.12]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {patchWorkbench, patchRuntime, providerConfigBranch, antigravityReasoningBranch} from '../patches.mjs';
import {pickerSectionHelpersSrc} from '../picker-sections.mjs';
import {prefix, providerModels} from '../models.mjs';
import {sampleCatalog} from './checks/sample-models.mjs';
import {supportedVersions, isTunnelled, atLeast} from '../build-support.mjs';
import {verifyAgentHost} from './checks/agent-host-check.mjs';
import {verifyConversationActionsWorkbench, verifyConversationActionsRuntime} from './checks/conversation-actions-check.mjs';
import {verifySubagentLifecycle} from './checks/subagent-lifecycle-check.mjs';
import {verifySubagentRegistration} from './checks/subagent-registration-check.mjs';
import {verifySubagentModels} from './checks/subagent-model-check.mjs';
import {verifySubagentSettings} from './checks/subagent-settings-check.mjs';
import {verifyMaxMode, verifyContextBudget} from './checks/max-mode-check.mjs';
import {verifyWorkbenchRouting} from './checks/workbench-routing-check.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => (i % 2 ? pairs : [...pairs, [all[i].slice(2), all[i + 1]]]), []));
if (!args.original) throw new Error('Usage: node scripts/verify-build.mjs --original <resources/app | gpt backup dir> [--combined <resources/app>]');
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
// Default to the newest reviewed build; --version checks an older one.
const version = args.version ?? supportedVersions[0];
const symbols = JSON.parse(fs.readFileSync(path.join(here, '..', `symbols-${version}.json`), 'utf8'));
// Builds that let the agent run on the SSH host instead of the dedicated UI runtime.
const remoteTunnel = isTunnelled(version);
const config = {port:43190, key:'0'.repeat(64)};

function bundleFiles(dir) {
  if (fs.existsSync(path.join(dir, '0-workbench.desktop.main.js'))) return {
    desktop:path.join(dir, '0-workbench.desktop.main.js'), glass:path.join(dir, '1-workbench.glass.main.js'),
    exec:path.join(dir, '2-main.js'), runtime:path.join(dir, '3-main.js')};
  return {desktop:path.join(dir, 'out/vs/workbench/workbench.desktop.main.js'), glass:path.join(dir, 'out/vs/workbench/workbench.glass.main.js'),
    exec:path.join(dir, 'extensions/cursor-agent-exec/dist/main.js'), runtime:path.join(dir, 'extensions/cursor-local-agent-runtime/dist/main.js')};
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-gemini-link-verify-'));
function syntax(label, content) {
  const file = path.join(temp, label.replace(/\W+/g, '-') + '.mjs');
  fs.writeFileSync(file, content);
  execFileSync(process.execPath, ['--check', file], {stdio:'pipe', windowsHide:true});
  fs.unlinkSync(file);
}

async function verifyProviderConfig(content) {
  const header = content.match(/async getLocalAgentProviderConfig\(([\w$]+),([\w$]+)\)\{/);
  const branch = providerConfigBranch(`${header[2]}?.requestedModel?.modelId??${header[1]}?.modelId`);
  assert.ok(content.includes(header[0] + branch), 'provider branch runs first');
  const config = new Function('__isAntigravityModel', '__antigravityBridgeBase', '__antigravityBridgeKey',
    `return async function(${header[1]},${header[2]}){${branch}return "native"}`)(
    m => typeof m === 'string' && m.startsWith(prefix), 'http://127.0.0.1:43190', 'bridge-key');
  // Both surfaces pass the request first and the run options second; only the
  // minified parameter names differ.
  assert.deepEqual(await config({modelId:prefix + 'gemini-3.8-flash'}, {requestedModel:{modelId:prefix + 'gemini-4-argon'}}),
    {baseUrl:'http://127.0.0.1:43190/v1', apiKey:'bridge-key', customHeaders:{}});
  assert.equal(await config({modelId:'claude-subscription/opus'}, {}), 'native', 'other models untouched');
}

function verifyWorkbenchWiring(content, surface) {
  const s = symbols[surface];
  assert.ok(content.includes(pickerSectionHelpersSrc), 'four-provider picker helper present');
  assert.ok(!content.includes('const claude=[],chatgpt=[],mercury=[];') && !content.includes('const claude=[],chatgpt=[];'), 'no older helper copy left');
  const helper = new Function(pickerSectionHelpersSrc + 'return __withSubscriptionPickerSections;')();
  const grouped = helper({leading:[{name:prefix + 'gemini-4-argon'}], promoted:[{name:'claude-subscription/opus'}, {name:'inception-mercury/mercury-2.5'}, {name:'gpt-5'}], others:[{name:'chatgpt-codex/gpt-6'}]});
  assert.deepEqual(grouped.antigravity.map(m => m.name), [prefix + 'gemini-4-argon']);
  assert.deepEqual(grouped.mercury.map(m => m.name), ['inception-mercury/mercury-2.5']);
  assert.deepEqual(grouped.promoted.map(m => m.name), ['gpt-5']);
  assert.equal(grouped.claude.length + grouped.chatgpt.length, 2);
  assert.ok(content.includes(`${s.modelsVar}.antigravity.length>0&&${s.jsx}(${s.fmt},{models:${s.modelsVar}.antigravity,title:"Antigravity",renderModel:${s.renderModel}},"antigravity-models")`), 'Antigravity section rendered');
  assert.match(content, /getAvailableDefaultModels\(\)\{return __withAntigravityModels\(/, 'default models include Antigravity');
  assert.ok(content.includes(`${s.mapVar}=__withAntigravityModels(`), 'mapped models include Antigravity');
  const params = s.runAnchor.match(/^async run\(([\w$,]+)\)/)[1].split(',');
  assert.ok(content.includes(`__isAntigravityModel(${params[10]}?.requestedModel?.modelId??${params[3]}?.modelId)`), 'Antigravity requests use the local runtime');
  // With the tunnel, a remote session keeps Cursor's own decision and runs the
  // agent on the host; before it, Antigravity was forced into the local runtime.
  const forced = `(__isAntigravityModel(${s.hostModelVar})&&Boolean(this.environmentService.remoteAuthority)||${s.host}(this.storageService,"useDedicatedLocalAgentRuntimeHost"))`;
  if (remoteTunnel) {
    assert.ok(!content.includes(forced), 'remote sessions are not forced into the local runtime');
    assert.ok(content.includes(`${s.host}(this.storageService,"useDedicatedLocalAgentRuntimeHost")`), 'the native runtime decision is still there');
  } else assert.ok(content.includes(forced), 'remote SSH routing');
  assert.ok(content.includes('__ensureAntigravityTaskBubble(this._composerDataService,'), 'task bubble repair wired');
  for (const registry of ['__subscriptionSubagentPrefixes', '__subscriptionActionPrefixes']) {
    const list = JSON.parse(content.match(new RegExp(`var ${registry}=(\\[[^;]+\\]);`))[1]);
    assert.ok(list.includes(prefix), `${registry} includes Antigravity`);
  }
}

function verifyRuntime(content) {
  const effort = content.match(/"none"===([\w$]+)\?void 0:\1\}\(([\w$]+)\);/);
  assert.ok(content.includes(effort[0] + antigravityReasoningBranch(effort[2])), 'reasoning branch wired');
  const header = content.match(/function\(e,t,[\w$]+,[\w$]+,[\w$]+,[\w$]+=!1,i\)\{const a=function\(e\)\{/);
  // The flag argument is null!=o&&o up to 3.22 and o??!1 from 3.24.
  const end = content.slice(header.index).search(/\}\([\w$]+,t,[\w$]+,[\w$]+,[\w$]+,(?:null!=([\w$]+)&&\1|[\w$]+\?\?!1),a\)/) + header.index;
  const normalize = new Function('return (' + content.slice(header.index, end + 1) + ')')();
  for (const value of ['low', 'medium', 'high']) {
    const request = {reasoning:{effort:'x'}, service_tier:'priority'};
    normalize(request, prefix + 'gemini-4-argon', [{id:'reasoning', value}], 'openai_compatible');
    assert.deepEqual(request, {reasoning_effort:value});
  }
  assert.ok(content.includes('__normalizeAntigravitySubagentModel'), 'subagent model normalization wired');
  assert.ok(JSON.parse(content.match(/var __subscriptionActionPrefixes=(\[[^;]+\]);/)[1]).includes(prefix), 'runtime action registry includes Antigravity');
}

// The runtime trusts catalog context and output limits only for entries whose
// API type, tool use, streaming and text output it recognises.
function verifyCatalogCapabilities(content) {
  const types = content.match(/const ([\w$]+)=new Set\((\["chat_completions",[^\]]*\])\),([\w$]+)=new Set\(\[\.\.\.\1,"anthropic_messages"\]\)/);
  assert.ok(types, 'Native API type list found');
  const known = new Set([...JSON.parse(types[2]), 'anthropic_messages']);
  // Down-levelled optional chaining up to 3.22, native ?. from 3.24.
  assert.ok(content.includes('return!1;return ') && /!0===([\w$]+)\.supports_tool_use&&!0===\1\.supports_streaming&&!0===(?:\(null===\([\w$]+=\1\.output_modalities\)|\1\.output_modalities\?\.includes\("text"\))/.test(content), 'Native extended capability check found');
  for (const entry of providerModels(sampleCatalog)) {
    const c = entry.capabilities;
    assert.ok(entry.api_types.some(type => known.has(type)) && c.supports_tool_use === true && c.supports_streaming === true && c.output_modalities.includes('text'),
      `${entry.id} passes the extended capability check`);
    verifyContextBudget(content, entry);
  }
}

const registry = (content, name) => JSON.parse(content.match(new RegExp(`var ${name}=(\\[[^;]+\\]);`))[1]);

async function scenario(label, dir) {
  const files = bundleFiles(dir);
  for (const surface of ['desktop', 'glass']) {
    const content = patchWorkbench(fs.readFileSync(files[surface], 'utf8'), surface, symbols[surface], config, sampleCatalog, {remoteTunnel});
    syntax(`${label}-${surface}`, content);
    verifyWorkbenchWiring(content, surface);
    if (atLeast(version, '3.24.12')) verifyAgentHost(content);
    await verifyProviderConfig(content);
    console.log(`${label} ${surface}: syntax, unique anchors, picker and provider configuration passed.`);
    verifyMaxMode(content);
    await verifySubagentRegistration(content);
    await verifySubagentLifecycle(content, registry(content, '__subscriptionSubagentPrefixes'));
    await verifyConversationActionsWorkbench(content, registry(content, '__subscriptionActionPrefixes'));
    await verifyWorkbenchRouting(content, undefined, {remoteTunnel});
  }
  for (const name of ['exec', 'runtime']) {
    const content = patchRuntime(fs.readFileSync(files[name], 'utf8'));
    syntax(`${label}-${name}`, content);
    verifyRuntime(content);
    console.log(`${label} ${name}: syntax, unique anchors, reasoning forwarding and registries passed.`);
    await verifySubagentModels(content);
    verifySubagentSettings(content);
    verifyConversationActionsRuntime(content);
    verifyCatalogCapabilities(content);
  }
}

try {
  await scenario('standalone', args.original);
  if (args.combined) await scenario('combined', args.combined);
} finally {
  fs.rmSync(temp, {recursive:true, force:true});
}
