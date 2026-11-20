// Cursor can dispatch a local subagent before its Task bubble exists in the
// Agents Window. Materialize that bubble through ToolFormer so the normal
// parent-linking barrier can observe it. Never signal a fake bubble.
export function ensureAntigravityTaskBubble(service, request, parent, taskType, Params, capabilityType) {
  if (!parent || typeof request.modelId !== 'string' || !request.modelId.startsWith('antigravity/')) return;
  request.abortSignal?.throwIfAborted();
  const model = parent.data?.modelConfig;
  const ids = [model?.modelName, ...(model?.selectedModels ?? []).map(entry => entry.modelId)];
  if (!ids.some(id => typeof id === 'string' && id.startsWith('antigravity/'))) return;
  service.loadComposerCapabilities?.(parent);
  const toolFormer = service.getComposerCapability(parent, capabilityType);
  if (!toolFormer || toolFormer.getBubbleIdByToolCallId(request.toolCallId) !== undefined) return;
  const name = request.subagentType || 'general-purpose';
  toolFormer.getOrCreateBubbleId({
    toolCallId:request.toolCallId, toolIndex:0, modelCallId:'', toolCallType:taskType, name:'task_v2',
    params:{case:'taskV2Params', value:new Params({description:name, prompt:request.prompt ?? '',
      subagentType:name, name, model:request.modelId, mode:request.mode})}
  });
}

export function patchSubagentBubbles(source, surface, symbols) {
  const desktop = surface === 'desktop';
  if (!desktop && surface !== 'glass') throw new Error('Unknown workbench surface');
  const request = desktop ? 'e' : 't', parent = desktop ? 't' : 'e';
  // The locals rotate between builds (the bubble handle is i up to 3.25 and n
  // from 3.31), so they are read from the method instead of written in.
  const name = value => value.replace(/\$/g, '\\$');
  const matches = [...source.matchAll(new RegExp('async _waitForParentTaskBubbleIfPossible\\(([\\w$]+)\\)\\{const ([\\w$]+)='+name(symbols.trim)+'\\(\\1\\.parentConversationId\\),([\\w$]+)='+name(symbols.trim)+'\\(\\1\\.toolCallId\\);if\\(!\\2\\|\\|!\\3\\)return;const ([\\w$]+)=this\\._composerDataService\\.getHandleIfLoaded\\(\\2\\);', 'g'))];
  if (matches.length !== 1) throw new Error('Subagent bubble anchor is not unique: '+surface);
  const [anchor, caller, , , handle] = matches[0];
  const call = '__ensureAntigravityTaskBubble(this._composerDataService,'+caller+','+handle+','+symbols.taskV2+'.TASK_V2,'+symbols.taskV2Params+','+symbols.toolFormer+'.TOOL_FORMER);';
  return ensureAntigravityTaskBubble.toString().replace('function ensureAntigravityTaskBubble','function __ensureAntigravityTaskBubble')+'\n'+source.replace(anchor,()=>anchor+call);
}
