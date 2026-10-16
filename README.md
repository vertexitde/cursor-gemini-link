# cursor-gemini-link

An experimental patch that adds the models of your Google Antigravity plan to Cursor: **Gemini 4 Argon**, Gemini 3.8 Flash, and whatever else `agy models` lists for your account (on a Pro plan in October 2026 also Claude Opus 5.5, Claude Sonnet 5.5 and GPT-OSS 120B). The models are run by Google's official Antigravity CLI (`agy`), signed in with your own account. Cursor keeps its agent harness, tools and approval controls. No extension is installed.

Companion projects: [cursor-gpt-link](https://github.com/vertexitde/cursor-gpt-link), [cursor-claude-link](https://github.com/vertexitde/cursor-claude-link) and [cursor-mercury-link](https://github.com/vertexitde/cursor-mercury-link). All four can be installed together.

## Status

| Item | Current status |
| --- | --- |
| Client platform | Windows x64 |
| Supported Cursor | 3.25.9, commit `5d4df965746c5d09740842fc0f1331ba1c157830`; 3.24.12, commit `37b865941ccb31e2fc90c685157534efca87f960` |
| Antigravity CLI | `agy` 1.4.0, signed in with a personal Google account |
| Models | Read from `agy models` at install time and again whenever the bridge starts |
| Through `agy`, verified live on October 16, 2026 | Gemini 4 Argon at Low, Medium and High; structured tool calls; a full tool round trip; images through the working folder |
| Automated checks | Unit tests, and Cursor's extracted code with the patch applied on the original 3.25.9 and 3.24.12 bundles |
| Combined install | On top of cursor-gpt-link, cursor-claude-link and cursor-mercury-link; see [testing notes](docs/testing.md) |
| In-app use | Not yet confirmed in the Cursor UI |

## What it adds

**Antigravity** appears as its own section in the model picker, below the companion sections when those are installed. Each model carries the Antigravity mark and offers **Effort** with the levels `agy` lists for it: Low, Medium (default) and High for Gemini 4 Argon, Gemini 3.8 Flash and the Claude models; GPT-OSS 120B has a single level. Gemini 4 Argon reports its 1M token window to Cursor.

There is nothing to configure in Cursor: `agy` uses your Antigravity sign-in.

### In Cursor's agent harness

- **Tools**: Cursor's tools are offered to the model, and the model's tool calls come back to Cursor, which runs them under its own approvals. `agy` is told not to use its own tools, and runs in an empty private folder with its sandbox on.
- **Images**: `agy` accepts text only on its input, so pasted images are written into that private folder and the model looks at them with `agy`'s read-only file viewer. The folder is deleted after every turn.
- **Subagents, queued follow-ups, Plan to Build, Max mode and context** use the same handling as the companion patches: the empty Task model inherits the parent, stopping a chat stops its subagents, follow-ups reach the running turn, and the chosen effort survives Max mode.

### Limits

- Each turn is one `agy` run. Answers arrive in one piece, not token by token, and `agy` adds about 12K tokens of its own instructions to every turn, which Cursor counts as context.
- Context windows are not reported by `agy`. Gemini models are listed with 1M, GPT-OSS 120B with 128K and anything else with a conservative 200K.
- Whether Google permits starting `agy` from another program under its terms is not settled publicly. This project only starts the official binary as a local process and never touches Antigravity credentials, which is the boundary discussed on Google's developer forum. Use it at your own discretion.

## Requirements

- Windows x64 and a supported Cursor build.
- Node.js 22 or newer on PATH.
- The Antigravity CLI, signed in: `irm https://antigravity.google/cli/install.ps1 | iex`, then run `agy` once and sign in. Gemini 4 Argon needs a Google AI Pro or Ultra plan.
- Permission to modify the Cursor installation.

There are no npm dependencies.

## Install

Close Cursor. If you use the companion patches, install them first: ChatGPT, Claude, Mercury, then Antigravity.

```powershell
git clone https://github.com/vertexitde/cursor-gemini-link.git
cd cursor-gemini-link
npm test
npm run check
npm run install:patch
```

`check` asks `agy` for your models, then verifies the Cursor version, commit, original file hashes (or matching companion installations), unique patch anchors and JavaScript syntax without writing anything.

## Remove

Close Cursor and remove Antigravity **before** removing any companion patch, because all four modify the same files:

```powershell
npm run restore
```

## Remote sessions

As with the companions, a Remote-SSH window runs the agent on the host, and the installer adds a reverse forward for port `43190` to the shared block in `~/.ssh/config`. `agy` itself keeps running on this machine. `npm run install:remote -- <host>` carries the runtime repairs to a host, and hosts that already have them are updated by every local install.

## After a Cursor update

A Cursor update replaces the patched files and the installer refuses unknown builds. A new build is supported by its reviewed `build-<version>.json` and `symbols-<version>.json`:

```powershell
node scripts/derive-symbols.mjs <path to original resources/app>
node scripts/verify-build.mjs --original <original resources/app> --combined <resources/app with companions installed> [--version <build>]
```

Then remove the stale `installed.json` and reinstall in order: ChatGPT, Claude, Mercury, Antigravity.

## How it works

- A local bridge listens on `127.0.0.1:43190` and starts with Cursor. It requires a random per-installation key and speaks OpenAI chat completions to Cursor's local agent runtime.
- For every request the bridge starts `agy --model <slug> --input-format stream-json --output-format stream-json --json-schema <file> --sandbox` in a new empty folder. The slug is the model at the chosen effort, for example `gemini-4-argon-high`.
- The conversation, the agent instructions and Cursor's tool definitions go to `agy` as one JSON message. The JSON schema makes the answer come back as `{text, tool_calls}`; the bridge checks every call against the tools Cursor offered and returns it in OpenAI form, streamed or not.
- In the workbench, the patch adds the models, routes them through the local runtime, and joins the shared picker, queue, stop and subagent handling that the companion patches install.

## Security

The bridge accepts connections from the local machine only and rejects requests without its installation key. `config.json` contains that key; do not share it. This project does not read, store or forward Antigravity credentials. See [testing notes](docs/testing.md) for what was verified.

## License

MIT. Cursor is a trademark of Anysphere. Google, Gemini and Antigravity are trademarks of Google LLC. The Antigravity icon is from LobeHub Icons (MIT); see [third-party notices](THIRD_PARTY_NOTICES.md). This project is not affiliated with any of them.
