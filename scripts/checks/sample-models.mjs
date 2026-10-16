// What `agy models` printed on October 16, 2026, as a fixed catalog for checks.
import {parseModelList} from '../../models.mjs';

export const sampleModelList = [
  'gemini-4-argon-medium\tGemini 4 Argon (Medium)', 'gemini-4-argon-high\tGemini 4 Argon (High)', 'gemini-4-argon-low\tGemini 4 Argon (Low)',
  'gemini-3.8-flash-high\tGemini 3.8 Flash (High)', 'gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)', 'gemini-3.8-flash-low\tGemini 3.8 Flash (Low)',
  'claude-opus-5-5-low\tClaude Opus 5.5 (Low)', 'claude-opus-5-5-medium\tClaude Opus 5.5 (Medium)', 'claude-opus-5-5-high\tClaude Opus 5.5 (High)',
  'claude-sonnet-5-5-low\tClaude Sonnet 5.5 (Low)', 'claude-sonnet-5-5-medium\tClaude Sonnet 5.5 (Medium)', 'claude-sonnet-5-5-high\tClaude Sonnet 5.5 (High)',
  'gpt-oss-120b-medium\tGPT-OSS 120B (Medium)'].join('\n');
export const sampleCatalog = parseModelList(sampleModelList);
