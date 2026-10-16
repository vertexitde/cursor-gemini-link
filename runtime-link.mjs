// What this link contributes to an agent runtime, on the client and on an SSH
// host. The marker is what this provider leaves behind, so a second link can
// patch the same file without tripping over the first one's work.
import {patchRuntime} from './patches.mjs';

export const link = 'cursor-gemini-link';
export const prefix = 'antigravity/';
export const marker = 't.startsWith("antigravity/")';
export {patchRuntime};
