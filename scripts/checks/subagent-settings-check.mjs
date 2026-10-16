// Execute Cursor's local task configuration with synthetic inputs. Cursor's
// bundled code is read from a local installation and is never redistributed.
import assert from 'node:assert/strict';
import {configureTaskProps,selectedParameters,selectedModelIds} from '../../subagent-settings.mjs';
export function verifySubagentSettings(source) {
 // Up to 3.22 the nullish fallback is down-levelled; from 3.24 it is native.
 const match=source.match(/function ([\w$]+)\(e\)\{const t=\(\)=>!1,([\w$]+)=([\w$]+)\(e\)(?:,([\w$]+)=null!=\2\?\2:e\.localProvider|\?\?e\.localProvider);/);
 assert.ok(match,'Native local task factory found');
 // The factory ends where the source first parses as one function; 3.25 no
 // longer follows it with the same neighbour.
 const tail=source.slice(match.index);
 let end=-1;for(let i=tail.indexOf('}');i>0&&i<20000;i=tail.indexOf('}',i+1)){try{new Function('return ('+tail.slice(0,i+1)+')');end=i+1;break;}catch{}}
 assert.ok(end>0,'Native local task factory end found');
 const fn=tail.slice(0,end);
 const resolver=fn.match(/[\w$]+=([\w$]+)\("grok-4.5"/)[1];
 const normalize=fn.match(/"explore"===([\w$]+)\(t.subagentType\)/)[1];
 const models=fn.match(/subagentModels:([\w$]+)\([\w$]+,t\)/)[1];
 const policy=fn.match(/subagentModelForcePolicy:([\w$]+),/)[1];
 const dependencies={[match[3]]:e=>e.localProvider,[resolver]:(id,available)=>available.some(m=>m.id===id)?id:undefined,
   [normalize]:value=>value,[models]:models=>({modelsBySlug:new Map(Object.entries(models))}),[policy]:'none'};
 const native=new Function(...Object.keys(dependencies),'return ('+fn+')')(...Object.values(dependencies));
 const parent='antigravity/gemini-4-argon',child='antigravity/gemini-3.8-flash',parentParams=[{id:'reasoning',value:'low'}];
 const selectedParams=[{id:'reasoning',value:'high'}];
 for(const modelId of [child,'another-provider/model']){
  const overrides=[{subagentType:'explore',selection:{case:'model',value:{modelId,parameters:selectedParams}}}];
  const base={modelId:parent,localProvider:{kind:'http',endpoints:[]},modelParameters:parentParams,subagentModelOverrides:overrides};
  assert.equal(native(base).subagentModelOverrides.explore.type,'inherit','Original missing-catalog failure reproduced');
  const input={...base,availableModels:selectedModelIds([],overrides,parent).map(modelId=>({modelId}))};
  const props=configureTaskProps(input,native(input));
  assert.deepEqual(props.subagentModelOverrides.explore,{type:'model',modelId});
  assert.deepEqual(props.parentModelParameters,parentParams);
  assert.deepEqual(selectedParameters(props,{subagent_type:{type:{case:'explore'}},userRequestedModelId:modelId},modelId),selectedParams);
 }
 for(const mode of ['default','inherit','disabled']){
  const input={modelId:parent,localProvider:{kind:'http'},subagentModelOverrides:mode==='default'?[]:[{subagentType:'explore',selection:{case:mode,value:true}}]};
  const original=native(input),patched=configureTaskProps(input,original);
  assert.deepEqual(patched.subagentModelOverrides,original.subagentModelOverrides);
  assert.equal(patched.subagentModelOverrides.explore.type,mode==='default'?'inherit':mode);
 }
 assert.match(source,/modelId:([\w$]+)\.modelDetails\.modelId,modelParameters:\1\.parameters,modelInfo:[\w$]+/);
 assert.ok(source.includes('resolvedModelParameters:__AntigravitySelectedParameters(a,'),'Parameters forwarded into client subagent resolution');
 console.log('Native Explore settings: missing catalog reproduced; model, Default, Inherit, Disabled and parameters passed.');
}
