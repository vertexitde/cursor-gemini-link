import fs from 'node:fs';
import {modelTooltip} from './model-tooltip.mjs';

export const prefix = 'antigravity/';
export const efforts = ['low', 'medium', 'high'];
export const defaultEffort = 'medium';

// `agy models` lists one slug per reasoning effort ("gemini-4-argon-low",
// "gemini-4-argon-medium", …). Cursor shows one model with an Effort parameter,
// so the efforts are folded back into their base model here and the bridge
// picks the slug again from the selected effort.
export function parseModelList(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const [slug, ...rest] = line.trim().split('\t');
    if (!/^[a-z0-9][a-z0-9.\-]*$/.test(slug ?? '') || !rest.length) continue;
    rows.push({slug, label:rest.join(' ').trim()});
  }
  const grouped = new Map();
  for (const {slug, label} of rows) {
    const match = slug.match(/^(.*)-(low|medium|high)$/);
    const base = match ? match[1] : slug, effort = match?.[2];
    const name = label.replace(/\s*\((Low|Medium|High)\)$/, '').trim() || base;
    const model = grouped.get(base) ?? {id:base, name, slugs:{}};
    if (effort) model.slugs[effort] = slug; else model.slugs.default = slug;
    grouped.set(base, model);
  }
  return [...grouped.values()].map(model => ({...model, ...limitsFor(model.id), summary:summaryFor(model.id, model.name)}));
}

// Antigravity does not report limits. These follow the providers' published
// windows; anything unknown gets a conservative 200K.
export function limitsFor(id) {
  if (/^gemini-4-argon/.test(id)) return {contextLength:1048576, maxOutputTokens:65536};
  if (/^gemini-/.test(id)) return {contextLength:1048576, maxOutputTokens:65536};
  if (/^gpt-oss-/.test(id)) return {contextLength:131072, maxOutputTokens:32768};
  return {contextLength:200000, maxOutputTokens:32000};
}

function summaryFor(id, name) {
  if (/^gemini-4-argon/.test(id)) return 'Google\'s frontier model in Antigravity: long-horizon agentic coding with a 1M token window.';
  if (/^gemini-[\d.]+-flash/.test(id)) return 'Fast Gemini model through Antigravity for everyday edits and quick answers.';
  if (/^claude-opus/.test(id)) return 'Claude Opus through your Antigravity plan, for complex reasoning and architecture work.';
  if (/^claude-sonnet/.test(id)) return 'Claude Sonnet through your Antigravity plan, a versatile choice for everyday coding.';
  if (/^gpt-oss/.test(id)) return 'OpenAI\'s open-weight model served by Antigravity.';
  return name + ' through your Antigravity plan.';
}

export const effortsOf = model => efforts.filter(effort => model.slugs[effort]);
export const defaultEffortOf = model => {
  const available = effortsOf(model);
  return available.includes(defaultEffort) ? defaultEffort : available[0];
};

// The model slug agy expects for a request: the base model at the selected
// effort, or its default effort when none was chosen or it is not offered.
export function slugFor(model, effort) {
  if (model.slugs.default) return model.slugs.default;
  const aliases = {none:'low', minimal:'low', instant:'low', xhigh:'high', max:'high'};
  const wanted = aliases[effort] ?? effort;
  return model.slugs[wanted] ?? model.slugs[defaultEffortOf(model)];
}

// The Antigravity mark from LobeHub Icons (MIT), in its own colours. The picker
// keeps line breaks in labels, so the markup must be a single line.
const antigravityIcon = fs.readFileSync(new URL('./antigravity.svg', import.meta.url), 'utf8').trim()
  .replace(/>\s+</g, '><').replace(/\s+/g, ' ').replace(/<title>[^<]*<\/title>/, '')
  .replace(/^<svg ([^>]*)>/, (_, attributes) => '<svg ' + attributes.replace(/\s*(?:width|height|style)="[^"]*"/g, '') +
    ' width="12" height="12" aria-hidden="true" style="display:inline-block;vertical-align:-2px;margin-right:6px;flex:none">');

const effortName = value => value[0].toUpperCase() + value.slice(1);
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function findModel(catalog, id) {
  return catalog.find(model => model.id === id);
}

export function pickerModels(catalog) {
  return catalog.map(model => {
    const id = prefix + model.id, name = model.name, available = effortsOf(model), chosen = defaultEffortOf(model);
    const tooltip = effort => modelTooltip(name, model.summary, model.contextLength, effort);
    const label = effort => antigravityIcon + escape(name) + (effort ? ' <span style="color: var(--cursor-text-tertiary);">' + effortName(effort) + '</span>' : '');
    return {name:id, serverModelName:id, clientDisplayName:name, inputboxShortModelName:name,
      defaultOn:true, supportsAgent:true, supportsImages:true, supportsThinking:available.length > 0,
      supportsNonMaxMode:true, supportsMaxMode:false, supportsPlanMode:true, supportsAutoContext:true,
      contextTokenLimit:model.contextLength, contextTokenLimitForMaxMode:model.contextLength, autoContextMaxTokens:model.contextLength,
      namedModelSectionIndex:0, vendorName:'google', vendor:{id:0, displayName:'Antigravity'},
      modelPickerBadges:[], cloudAgentEffortModes:[], tagline:model.summary, tooltipData:tooltip(chosen),
      parameterDefinitions:available.length ? [{id:'reasoning', name:'Effort', isCycleableByHotkey:true,
        markdownTooltip:'How long the model thinks before answering. Low answers fastest; High spends the most thinking on multi-step problems.',
        parameterType:{enumParameter:{values:available.map(value => ({value, displayName:effortName(value), modelPickerBadges:[]}))}}}] : [],
      variants:(available.length ? available : [undefined]).map(effort => ({
        parameterValues:effort ? [{id:'reasoning', value:effort}] : [],
        displayName:label(effort),
        displayNameOutsidePicker:name + (effort ? ' ' + effortName(effort) : ''),
        variantStringRepresentation:id + (effort ? '[reasoning=' + effort + ']' : ''),
        // No Max variants. With Max mode on, Cursor looks for the default Max
        // configuration and otherwise falls back to the first variant (Low),
        // so the default effort serves both modes.
        isMaxMode:false, isDefaultNonMaxConfig:effort === chosen, isDefaultMaxConfig:effort === chosen,
        tagline:model.summary, tooltipData:tooltip(effort)})),
      legacySlugs:[], idAliases:[]};
  });
}

// Served to Cursor's local agent runtime from GET /v1/models. The runtime only
// trusts these fields when tool use, streaming and text output are declared.
export function providerModels(catalog) {
  return catalog.map(model => ({id:prefix + model.id, object:'model', owned_by:'antigravity', api_types:['chat_completions'],
    capabilities:{context_length:model.contextLength, max_output_tokens:model.maxOutputTokens,
      supports_vision:true, supports_reasoning:effortsOf(model).length > 0, supports_tool_use:true, supports_streaming:true,
      input_modalities:['text', 'image'], output_modalities:['text']}}));
}
