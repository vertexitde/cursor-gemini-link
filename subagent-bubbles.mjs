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
  const anchor = 'async _waitForParentTaskBubbleIfPossible('+request+'){const '+parent+'='+symbols.trim+'('+request+'.parentConversationId),n='+symbols.trim+'('+request+'.toolCallId);if(!'+parent+'||!n)return;const i=this._composerDataService.getHandleIfLoaded('+parent+');';
  if (source.split(anchor).length !== 2) throw new Error('Subagent bubble anchor is not unique: '+surface);
  const call = '__ensureAntigravityTaskBubble(this._composerDataService,'+request+',i,'+symbols.taskV2+'.TASK_V2,'+symbols.taskV2Params+','+symbols.toolFormer+'.TOOL_FORMER);';
  return ensureAntigravityTaskBubble.toString().replace('function ensureAntigravityTaskBubble','function __ensureAntigravityTaskBubble')+'\n'+source.replace(anchor,()=>anchor+call);
}
