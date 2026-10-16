const escapeMarkdown=value=>String(value??'').replace(/([\\`*_{}\[\]()<>#+.!|])/g,'\\$1');
export function modelTooltip(name, description, context, effort, fast=false) {
  const size=context>=1000000?String(Math.floor(context/1000000))+'M':String(Math.round(context/1000))+'k';
  const version=effort?(effort==='xhigh'?'very high':effort)+' effort'+(fast?', fast':''):undefined;
  return {primaryText:'',secondaryText:'',secondaryWarningText:false,icon:'',tertiaryText:'',tertiaryTextUrl:'',
    markdownContent:'**'+escapeMarkdown(name)+'**  \n'+escapeMarkdown(description)+'\n\n'+size+' context window'+(version?'\n\n*Version: '+escapeMarkdown(version)+'*':'')};
}
