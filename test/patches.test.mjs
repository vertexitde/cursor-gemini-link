import test from 'node:test';
import assert from 'node:assert/strict';
import {once, patchRuntime, antigravityReasoningBranch, providerConfigBranch} from '../patches.mjs';
import {patchPickerSections, legacyPickerSectionHelpersSrc, mercuryPickerSectionHelpersSrc, pickerSectionHelpersSrc, withSubscriptionPickerSections} from '../picker-sections.mjs';
import {pickerModels, providerModels, parseModelList, slugFor} from '../models.mjs';
import {sampleCatalog, sampleModelList} from '../scripts/checks/sample-models.mjs';

test('anchors must occur exactly once, and replacements are literal', () => {
  assert.throws(() => once('a b a', 'a', 'x'), /2 matches/);
  assert.throws(() => once('abc', 'z', 'x'), /0 matches/);
  assert.equal(once('call(K)', 'K', "$&$'$1$K"), "call($&$'$1$K)");
});

test('picker helper keeps every companion bucket and adds Antigravity', () => {
  const groups = withSubscriptionPickerSections({leading:[{name:'antigravity/gemini-4-argon'}],
    promoted:[{name:'claude-subscription/opus'}, {name:'inception-mercury/mercury-2.5'}, {name:'composer'}], others:[{name:'chatgpt-codex/gpt'}]});
  assert.deepEqual(groups.leading, []);
  assert.deepEqual(groups.promoted.map(m => m.name), ['composer']);
  assert.deepEqual([groups.claude.length, groups.chatgpt.length, groups.mercury.length, groups.antigravity.length], [1, 1, 1, 1]);
});

const picker = {groupReturn:'return c.x?{a:1}:{a:2}', promotedAnchor:'HP(f,{models:B.promoted,title:c?.t', modelsVar:'B', jsx:'HP', fmt:'f', renderModel:'x'};
test('replaces the two- and three-provider helper copies instead of redefining them', () => {
  const combined = legacyPickerSectionHelpersSrc + '\n' + mercuryPickerSectionHelpersSrc + '\nreturn __withSubscriptionPickerSections(c.x?{a:1}:{a:2});B.claude.length>0&&HP(f,{},"claude-subscription-models"),HP(f,{models:B.promoted,title:c?.t';
  const out = patchPickerSections(combined, once, picker);
  assert.equal(out.split(legacyPickerSectionHelpersSrc).length, 1);
  assert.equal(out.split(mercuryPickerSectionHelpersSrc).length, 1);
  assert.equal(out.split(pickerSectionHelpersSrc).length, 3);
  assert.ok(out.includes('"claude-subscription-models"),B.antigravity.length>0&&HP(f,{models:B.antigravity,title:"Antigravity",renderModel:x},"antigravity-models"),HP(f,{models:B.promoted'));
});

test('installs the helper and wrapper when no companion is present', () => {
  const out = patchPickerSections('return c.x?{a:1}:{a:2};HP(f,{models:B.promoted,title:c?.t', once, picker);
  assert.ok(out.startsWith(pickerSectionHelpersSrc));
  assert.ok(out.includes('return __withSubscriptionPickerSections(c.x?{a:1}:{a:2})'));
});

test('provider branch points Antigravity models at the bridge without provider headers', async () => {
  const branch = providerConfigBranch('t?.requestedModel?.modelId??e?.modelId');
  const config = new Function('__isAntigravityModel', '__antigravityBridgeBase', '__antigravityBridgeKey', `return async function(e,t){${branch}return "native"}`)(
    m => typeof m === 'string' && m.startsWith('antigravity/'), 'http://127.0.0.1:43190', 'k');
  assert.deepEqual(await config({}, {requestedModel:{modelId:'antigravity/gemini-4-argon'}}), {baseUrl:'http://127.0.0.1:43190/v1', apiKey:'k', customHeaders:{}});
  assert.equal(await config({modelId:'gpt-5'}, {}), 'native');
});

test('runtime branch sets reasoning_effort for Antigravity only', () => {
  const normalizer = 'function(e,t,r,n,o,s=!1,i){const a=function(e){const r=e?.find(p=>p.id==="reasoning")?.value;return void 0===r||""===r||"none"===r?void 0:r}(r);if(void 0===a)return;e.native=a}';
  const source = 'x=' + normalizer + ';const{subagentConfig:t,requestedModel:r,parentModelId:n}=e;';
  assert.throws(() => patchRuntime(source), /anchor is not unique/, 'an incomplete bundle is rejected');
  const patched = once(source, '"none"===r?void 0:r}(r);', '"none"===r?void 0:r}(r);' + antigravityReasoningBranch('r'));
  const run = new Function('return (' + patched.slice(2, patched.indexOf(';const{')) + ')')();
  const antigravity = {reasoning:{effort:'x'}, service_tier:'priority'};
  run(antigravity, 'antigravity/gemini-4-argon', [{id:'reasoning', value:'high'}]);
  assert.deepEqual(antigravity, {reasoning_effort:'high'});
  const other = {};
  run(other, 'gpt-5', [{id:'reasoning', value:'low'}]);
  assert.deepEqual(other, {native:'low'});
});

test('agy model slugs fold into one model per base with its efforts', () => {
  assert.deepEqual(sampleCatalog.map(m => m.id), ['gemini-4-argon', 'gemini-3.8-flash', 'claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-oss-120b']);
  assert.deepEqual(sampleCatalog.map(m => m.name), ['Gemini 4 Argon', 'Gemini 3.8 Flash', 'Claude Opus 5.5', 'Claude Sonnet 5.5', 'GPT-OSS 120B']);
  const [argon] = sampleCatalog, oss = sampleCatalog.at(-1);
  assert.deepEqual(argon.slugs, {medium:'gemini-4-argon-medium', high:'gemini-4-argon-high', low:'gemini-4-argon-low'});
  assert.equal(argon.contextLength, 1048576);
  assert.equal(slugFor(argon, 'high'), 'gemini-4-argon-high');
  assert.equal(slugFor(argon, undefined), 'gemini-4-argon-medium', 'default effort');
  assert.equal(slugFor(argon, 'xhigh'), 'gemini-4-argon-high');
  assert.equal(slugFor(oss, 'high'), 'gpt-oss-120b-medium', 'falls back to the only effort offered');
  assert.deepEqual(parseModelList('Fetching available models...\n' + sampleModelList + '\n\n').map(m => m.id), sampleCatalog.map(m => m.id), 'status lines are ignored');
});

test('picker and provider catalogs describe image-capable reasoning models', () => {
  const models = pickerModels(sampleCatalog);
  assert.deepEqual(models.map(m => m.name), sampleCatalog.map(m => 'antigravity/' + m.id));
  const [argon] = models, oss = models.at(-1);
  assert.equal(argon.supportsImages, true);
  assert.equal(argon.supportsMaxMode, false);
  assert.deepEqual(argon.parameterDefinitions[0].parameterType.enumParameter.values.map(v => v.value), ['low', 'medium', 'high']);
  assert.deepEqual(argon.variants.filter(v => v.isDefaultNonMaxConfig).map(v => v.parameterValues[0].value), ['medium']);
  assert.deepEqual(argon.variants.filter(v => v.isDefaultMaxConfig).map(v => v.parameterValues[0].value), ['medium'], 'Max mode also defaults to Medium');
  assert.deepEqual(oss.variants.map(v => v.parameterValues[0].value), ['medium']);
  for (const model of models) {
    assert.ok(model.variants.every(v => v.isMaxMode === false));
    const label = model.variants[0].displayName;
    assert.ok(label.startsWith('<svg ') && label.includes(' width="12" height="12"'), 'Antigravity icon at picker size');
    assert.ok(!label.includes('1em'), 'the icon\'s own size is removed');
    assert.ok(!/[\r\n]/.test(label), 'label stays on one line');
  }
  assert.deepEqual(providerModels(sampleCatalog).map(m => m.capabilities.context_length), [1048576, 1048576, 200000, 200000, 131072]);
  assert.ok(providerModels(sampleCatalog).every(m => m.capabilities.supports_vision && m.api_types.includes('chat_completions')));
});

test('Max mode keeps the chosen Antigravity effort', async () => {
  const {antigravityVariant, patchMaxMode} = await import('../max-mode.mjs');
  const [model] = pickerModels(sampleCatalog);
  for (const effort of ['low', 'medium', 'high'])
    assert.equal(antigravityVariant(model, [{id:'reasoning', value:effort}]).parameterValues[0].value, effort);
  assert.equal(antigravityVariant(model, []).parameterValues[0].value, 'medium');
  const solver = 'function J4g(e,t,n){if(e.variants.length===0||!n&&e.supportsNonMaxMode===!1)return;return"native"}';
  const patched = patchMaxMode(solver);
  const solve = new Function('__isAntigravityModel', patched + ';return J4g')(name => name.startsWith('antigravity/'));
  assert.equal(solve(model, [{id:'reasoning', value:'high'}], true).parameters[0].value, 'high');
  assert.equal(solve({...model, name:'gpt-5'}, [], true), 'native');
  assert.throws(() => patchMaxMode('function x(){}'), /not unique/);
});
