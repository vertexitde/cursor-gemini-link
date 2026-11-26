# Testing notes

Updated on October 16, 2026.

## Environment

| Component | Version |
| --- | --- |
| Operating system | Windows 11, x64 |
| Cursor | 3.32.7, commit `c83fdd301426f2280908a553e0782475a1db4af0` (also reviewed: 3.32.5, 3.32.4, 3.32.1, 3.31.17, 3.31.12, 3.25.9 and 3.24.12) |
| Antigravity CLI | `agy` 1.4.0, personal Google account |
| Node.js | 26.8.1 |
| Companion patches | cursor-gpt-link, cursor-claude-link and cursor-mercury-link for the same build |

## Why `agy` and not the Gemini CLI

The Gemini CLI (0.64.0) signed in with a personal Google account is refused with `IneligibleTierError: UNSUPPORTED_CLIENT`; Google asks individual users to move to Antigravity. Gemini 4 Argon is not offered there at all. The Antigravity CLI lists it for the same account.

## Antigravity CLI, verified live

| Check | Result |
| --- | --- |
| `agy models` | `gemini-4-argon-{low,medium,high}`, `gemini-3.8-flash-{low,medium,high}`, `claude-opus-5-5-{low,medium,high}`, `claude-sonnet-5-5-{low,medium,high}`, `gpt-oss-120b-medium` |
| Text answer, `--output-format json` | Gemini 4 Argon at Low, Medium and High; High reports thinking tokens |
| Overhead | About 12,500 input tokens per turn for `agy`'s own instructions |
| `--input-format stream-json` | One line per turn: `{"event":"user","message":{"role":"user","content":[{"type":"text","text":…}]}}`. Image blocks are rejected ("only text") |
| `--json-schema` | The answer comes back as `{text, tool_calls}`; `agy` ends with its `finish` step and uses none of its own tools |
| Tool round trip | Argon asked for `read_file` with `{"path":"package.json"}`, then answered from the tool result |
| Images | Written as `attachment-1.png` into the working folder; Argon opened it with `view_file` and named the colour |
| Windows | stdout is complete when `agy` runs as a child process; no pseudo-terminal needed |

## November 2026 models

`agy models` on November 20, 2026 adds Gemini 4 Neon and Gemini 4 Hydrogen with a fourth effort, `xhigh`, and two orchestrators (`gemini-pro-orchestrator-neon`, `gemini-pro-orchestrator-g1-pro`). Neon at XHigh and Hydrogen at Medium answered through the runner; the Neon orchestrator returned a correct `read_file` call in about 32 seconds.

Cursor 3.32.4 is a patch release of 3.32.4. Every patched bundle changed, but only minified names rotated: the symbols were re-derived without problems (the extractor reproduces the reviewed 3.32.4 symbols), and all automated checks pass on the original 3.32.4 build and on top of the companions.

Cursor 3.32.1 split the workbench into ES modules. The model picker (its sections and grouping) and the Max-mode solver moved into `workbench.anysphere-ui.js`, a module both surfaces import, so that file is now patched as well: once, with the picker sections and the Max-mode branch, and with the same prelude as the surfaces. The settings pages were rebuilt from parts (`SettingsSection` and `SettingsRow`); the links draw their cards (subscription usage, the Inception key) through a small adapter onto those parts, so the same card code serves older builds. The run gate swapped its minified option names, which the extractor now reads instead of assuming. All automated checks pass on the original 3.32.1 build and on top of the companions, and 3.31.17 still verifies.

Cursor 3.31.17 is a patch release of 3.31.12. Every patched bundle changed, but only minified names rotated: the symbols were re-derived without problems, and all automated checks pass on the original 3.31.17 build.

Cursor 3.31.12 (3.26 to 3.30 were skipped) is again supported through its symbol table and file hashes, but it moved a lot. The model picker now builds its sections as a list of `{id, items, title}` entries, once for the menu and once for the grouped view; each link adds its entry before the pinned models, so the order follows the install order, and both renderers learned to show an entry's own trailing label for the usage. The local-mode branch also releases the send slot (`if(x.releaseAfterSend(…),go.localMode)`), the Plan & Usage card is a plain component whose children are expressions, and several minified locals rotated (the local model in the subagent catalog, the Task bubble handle, the cancel locals, the transcript cache). The agent host is now enabled by `_topologyEnabled`, which also covers private inference and Cursor Orbit; the links keep windows on the classic path there too. The runtime bundles are down-levelled again (`Object.assign`), and the user message rebuild moved behind the thread resolution. The extractor reproduced the reviewed 3.25.9 and 3.24.12 symbols before it was used here, and the checks now find methods by parsing and resolve new helpers to inert stubs. All automated checks pass on 3.31.12, and 3.25.9, 3.24.12 and 3.22.12 still verify.

## Automated checks

`npm test` covers the model list parsing, effort to slug mapping, picker and provider catalogs, the four-provider picker helper, the provider branch, the runtime effort branch, Max mode, the prompt and schema sent to `agy`, image handling, answer validation, the OpenAI response and stream shape, and the bridge with a stubbed `agy`.

`scripts/verify-build.mjs` patches Cursor's original bundles and runs the extracted Cursor code with the patch in place: picker, provider configuration, routing, Max-mode solver, context budget, subagent registration, lifecycle, model resolver and settings, and the queued follow-up path.

| Build | Standalone | Combined |
| --- | --- | --- |
| 3.32.7 | Passes | See below |
| 3.32.5 | Passes | See below |
| 3.32.4 | Passes | See below |
| 3.32.1 | Passes | See below |
| 3.31.17 | Passes | See below |
| 3.31.12 | Passes | See below |
| 3.25.9 | Passes | Passes |
| 3.24.12 | Passes | Not run |

Not yet confirmed: a turn in the Cursor UI and a remote session.
