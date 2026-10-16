# Testing notes

Updated on October 16, 2026.

## Environment

| Component | Version |
| --- | --- |
| Operating system | Windows 11, x64 |
| Cursor | 3.25.9, commit `5d4df965746c5d09740842fc0f1331ba1c157830` (also reviewed: 3.24.12) |
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

## Automated checks

`npm test` covers the model list parsing, effort to slug mapping, picker and provider catalogs, the four-provider picker helper, the provider branch, the runtime effort branch, Max mode, the prompt and schema sent to `agy`, image handling, answer validation, the OpenAI response and stream shape, and the bridge with a stubbed `agy`.

`scripts/verify-build.mjs` patches Cursor's original bundles and runs the extracted Cursor code with the patch in place: picker, provider configuration, routing, Max-mode solver, context budget, subagent registration, lifecycle, model resolver and settings, and the queued follow-up path.

| Build | Standalone | Combined |
| --- | --- | --- |
| 3.25.9 | Passes | See below |
| 3.24.12 | Passes | Not run |

Not yet confirmed: a turn in the Cursor UI and a remote session.
