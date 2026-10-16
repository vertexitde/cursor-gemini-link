import assert from 'node:assert/strict';
import {antigravityVariant} from '../../max-mode.mjs';
import {pickerModels} from '../../models.mjs';
import {sampleCatalog} from './sample-models.mjs';

// Execute Cursor's native variant solver on the real Antigravity picker models.
export function verifyMaxMode(source) {
 const m=source.match(/function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+)\)\{if\(\2.variants.length===0\|\|!\4&&\2.supportsNonMaxMode===!1\)return;/);
 assert.ok(m,'Native Max-mode solver found');
 const end=source.indexOf('}var ',m.index);assert.ok(end>m.index);
 const fn=source.slice(m.index,end+1);
 const eq=fn.match(/\.variants.find\([\w$]+=>([\w$]+)\(/)[1];
 const def=fn.match(/:([\w$]+)\([\w$]+,\{maxMode:/)[1];
 const same=(variant,params)=>variant.parameterValues.length===params.length&&variant.parameterValues.every(p=>params.some(q=>p.id===q.id&&p.value===q.value));
 // Cursor's default-variant helper: default config for the mode, then a variant of that mode, then the first.
 const defaults=(model,{maxMode})=>model.variants.find(v=>maxMode?v.isDefaultMaxConfig===true:v.isDefaultNonMaxConfig===true)??model.variants.find(v=>(v.isMaxMode===true)===maxMode)??model.variants[0];
 const none=()=>undefined;
 const dependencies={[eq]:same,[def]:defaults,__isAntigravityModel:name=>typeof name==='string'&&name.startsWith('antigravity/'),
  __AntigravityModelVariant:antigravityVariant,__ChatgptMaxModeVariant:none,__ClaudeMaxModeVariant:none,
  __isMercuryModel:()=>false,__MercuryModelVariant:none};
 const solve=new Function(...Object.keys(dependencies),'return ('+fn+')')(...Object.values(dependencies));
 const [model]=pickerModels(sampleCatalog);
 const ordinary={...model,name:'ordinary',variants:model.variants.map(v=>({...v,isDefaultMaxConfig:false}))};
 const high=model.variants.find(v=>v.parameterValues[0].value==='high');
 assert.equal(solve(ordinary,high.parameterValues,true).variant.parameterValues[0].value,'low','Native Max mode drops the chosen effort');
 for(const variant of model.variants)for(const maxMode of [false,true]){
  const result=solve(model,variant.parameterValues,maxMode);
  assert.deepEqual(result.parameters,variant.parameterValues,'effort survives with Max mode '+maxMode);
 }
 assert.equal(defaults(model,{maxMode:true}).parameterValues[0].value,'medium','picker shows Medium with Max mode on');
 assert.equal(defaults(model,{maxMode:false}).parameterValues[0].value,'medium');
 console.log('Native Max toggle: Low fallback reproduced; every Antigravity effort survives in both modes; default is Medium.');
}

// Execute Cursor's native context budget with an Antigravity catalog entry.
export function verifyContextBudget(source,entry) {
 // Shared by both forms: down-levelled spreads (Object.assign) up to 3.22,
 // native object spreads from 3.24.
 const marker='{modelId:t,apiTypes:';
 // The two runtime bundles order these minified locals differently.
 const pivot=source.indexOf(marker),start=source.lastIndexOf('function(e,t){',pivot),end=pivot+source.slice(pivot).search(/\}\([\w$]+,[\w$]+\)/);
 assert.ok(start>=0&&end>start,'Native model metadata decoder found');
 const fn=source.slice(start,end+1),number=fn.match(/contextLength:([\w$]+)\(/)[1];
 const parse=new Function(number,'return ('+fn+')')(value=>typeof value==='number'&&Number.isFinite(value)&&value>0?Math.floor(value):undefined);
 const metadata=parse(entry,entry.id);assert.equal(metadata.contextLength,entry.capabilities.context_length);
 assert.equal(parse({id:entry.id,context_window:metadata.contextLength},entry.id).contextLength,undefined,'Old top-level field was ignored');
 // Up to 3.22: p=null!==(n=i.contextLength)&&void 0!==n?n:…,m=void 0!==h?Math.min(h,null!=p?p:h):p
 // From 3.24:  l=n.contextLength??…,d=void 0!==u?Math.min(u,l??u):l   (metadata no longer named i)
 const legacy=source.match(/([\w$]+)=null!\=\=\(([\w$]+)=i.contextLength\)[\s\S]{0,2000}?,([\w$]+)=void 0!==([\w$]+)\?Math.min\(\4,null!=\1\?\1:\4\):\1/);
 const nativeForm=legacy?null:source.match(/([\w$]+)=([\w$]+)\.contextLength\?\?[\s\S]{0,2000}?,([\w$]+)=void 0!==([\w$]+)\?Math\.min\(\4,\1\?\?\4\):\1/);
 const m=legacy??nativeForm;
 assert.ok(m,'Native context budget found');
 const budgeted=m[3];
 const catalog=m[0].match(/of ([\w$]+).values\(\)/)[1],key=m[0].match(/e.id===([\w$]+)/)[1];
 const budget=legacy
   ?new Function('i','e',catalog,key,'var '+m[2]+';const '+m[0]+';return '+budgeted+';')
   :new Function(m[2],'e',catalog,key,'const '+m[0]+';return '+budgeted+';');
 for(const requested of [Math.min(200000,metadata.contextLength),metadata.contextLength,metadata.contextLength*2]){
  assert.equal(budget(metadata,{modelId:entry.id,modelParameters:[{id:'context',value:String(requested)}]},new Map(),'context'),Math.min(requested,metadata.contextLength));
 }
 assert.equal(budget(metadata,{modelId:entry.id,modelParameters:[]},new Map(),'context'),metadata.contextLength);
 console.log('Native context budget uses the selected size, reports the provider window and caps it at the advertised limit.');
}
