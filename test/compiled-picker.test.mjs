import test from 'node:test';
import assert from 'node:assert/strict';
import {patchPickerSections, compiledRebuild} from '../picker-sections.mjs';
import {supportedVersions, isTunnelled, atLeast} from '../build-support.mjs';

const once = (s, a, b) => { assert.equal(s.split(a).length, 2, 'unique: ' + a); return s.replace(a, () => b); };
// The 3.24 picker after the React compiler, reduced to the parts the patch touches.
const groupReturn = 'return o.merge?{leading:[],promoted:[...F,...D],others:$}:{leading:F,promoted:D,others:$}';
const sectionsReturn = 'return t[39]!==se||t[40]!==re?(ce=V4t(TPs,{children:[J,se,re,ue]})';
const picker = `function g(o,F,D,$){${groupReturn}}function p(t,D,se,re,ue,J,ce){${sectionsReturn},t[39]=se,t[40]=re):ce=t[43];return ce}`;
const symbols = {groupReturn, sectionsReturn, modelsVar:'D', jsx:'gN', fmt:'j_t', renderModel:'y'};

test('compiled picker: Antigravity section goes before the promoted, pinned and other sections', () => {
  const out = patchPickerSections(picker, once, symbols);
  assert.ok(out.includes(',D.antigravity.length>0&&gN(j_t,{models:D.antigravity,title:"Antigravity",renderModel:y},"antigravity-models"),se,re,ue]})'));
  assert.ok(out.includes('return ' + compiledRebuild('D') + 't[39]!==se'));
  assert.equal(patchPickerSections(out, once, symbols), out, 'idempotent');
});

test('compiled picker: the rebuild condition a companion wrote is reused', () => {
  const companion = picker.replace('return t[39]', 'return ' + compiledRebuild('D') + 't[39]')
    .replace(',se,re,ue]})', ',D.chatgpt.length>0&&gN(j_t,{models:D.chatgpt},"chatgpt-models"),se,re,ue]})');
  const out = patchPickerSections(companion, once, symbols);
  assert.equal(out.split(compiledRebuild('D')).length, 2, 'condition written once');
  assert.ok(out.includes('"chatgpt-models"),D.antigravity.length>0&&'));
  const rebuild = new Function('D', 'return ' + compiledRebuild('D') + 'false');
  assert.equal(rebuild({antigravity:[1]}), 1);
  assert.equal(rebuild({}), false);
});

test('supported builds come from the reviewed build and symbol files', () => {
  assert.ok(supportedVersions.includes('3.25.9') && supportedVersions.every((v, i, all) => i === 0 || atLeast(all[i - 1], v)), 'newest first');
  assert.ok(isTunnelled('3.24.12') && isTunnelled('3.22.9') && !isTunnelled('3.22.5'));
  assert.ok(atLeast('3.24.12', '3.22.12') && !atLeast('3.22.12', '3.24.1'));
});
