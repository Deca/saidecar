# Scratch AI

A lightweight terminal AI sidecar for quick developer questions inside Zellij.

It is intentionally not a coding agent. In direct OpenAI mode it does not scan repositories, read local files, run shell commands, or modify project files. In Codex mode it delegates the model call to `codex exec` so you can use Codex's Sign in with ChatGPT flow, while constraining Codex to an ephemeral read-only run outside the project directory.

## Features

- Interactive terminal prompt
- Normal fast Q&A
- `/think` reasoning mode
- `/web` web-search mode
- `/deepweb` reasoning + web-search mode
- Local JSONL logging
- Read-only log explorer with SQLite FTS search
- Designed for narrow Zellij side panes
- No repo mutation
- No shell execution

## Install

```bash
npm install
cp .env.example .env
npm link
```

Edit `.env` and choose `SCRATCH_AI_BACKEND=codex` or `SCRATCH_AI_BACKEND=openai`. Codex mode uses `codex login`; OpenAI mode requires `OPENAI_API_KEY`.

## Usage

```bash
scratch-ai
```

Open the log explorer directly:

```bash
scratch-logs
```

For local development:

```bash
npm start
```

## Commands

```text
/help
/exit
/q <question>
/think <question>
/t <question>
/web <question>
/w <question>
/deepweb <question>
/dw <question>
/status
/config
/modes
/history
/log
/clear
/reset
```

Normal input without a slash is treated as a fast question.

## Session Info

Use `/status` to see the current terminal session:

- backend and active models
- stateless request context
- estimated transcript size for the current terminal session
- exchange count, errors, web calls, and last latency
- API token usage when the direct OpenAI backend reports it
- current JSONL log file

The MVP does not automatically resend prior answers as context. The transcript estimate is for your visibility only.

## Modes

| Mode | Command | Web | Reasoning |
| --- | --- | --- | --- |
| normal | plain text or `/q` | no | none |
| think | `/think`, `/t` | no | medium |
| web | `/web`, `/w` | yes | low |
| deepweb | `/deepweb`, `/dw` | yes | medium |

With `SCRATCH_AI_BACKEND=codex`, `/web` and `/deepweb` use the local Codex OAuth web-search bridge. It reads `~/.codex/auth.json`, calls the ChatGPT Codex search endpoint, and returns cited answers when the endpoint provides citations.

The bridge adapts the MIT-licensed approach used by `pi-codex-search`; see `THIRD_PARTY_NOTICES.md`.

## Configuration

```env
OPENAI_API_KEY=
SCRATCH_AI_BACKEND=openai
SCRATCH_AI_MODEL=gpt-5.4-mini
SCRATCH_AI_THINK_MODEL=gpt-5.4-mini
SCRATCH_AI_CODEX_COMMAND=codex
SCRATCH_AI_CODEX_TIMEOUT_MS=120000
SCRATCH_AI_LOG_DIR=~/dev-brain/inbox
SCRATCH_AI_INDEX_PATH=~/dev-brain/scratch-ai.sqlite
SCRATCH_AI_PROJECT=general
SCRATCH_AI_TIMEZONE=Europe/Rome
```

The model defaults are conservative examples. Override them if your OpenAI account uses different model names.

## Codex OAuth Backend

To use your ChatGPT/Codex sign-in instead of a manually managed API key:

```bash
codex login
```

Choose **Sign in with ChatGPT**, then set:

```env
SCRATCH_AI_BACKEND=codex
OPENAI_API_KEY=
```

Codex mode runs normal and reasoning requests through:

```text
codex exec --ephemeral --ignore-rules --skip-git-repo-check --sandbox read-only
```

The sidecar also passes a temp working directory, disables approvals, and writes Codex's final message through a temporary file. `/web` and `/deepweb` use the Codex OAuth web-search bridge instead of the direct Codex CLI search flag.

## Zellij

The lowest-friction setup is to link the launcher once, then run it from anywhere.

One-time setup from this folder:

```bash
npm link
```

Daily command from any directory:

```bash
scratch-zellij
```

This creates or attaches a persistent `scratch-ai` Zellij session using `layouts/scratch-ai.kdl`. The default session opens two panes: `scratch-ai` on the left and `scratch-logs` on the right.

Dev layout from any directory:

```bash
scratch-zellij dev dev-with-scratch.kdl
```

Direct CLIs from anywhere:

```bash
scratch-ai
scratch-logs
```

You can also run through npm from this repo.

Recommended daily command:

```bash
npm run zellij:session
```

This creates or attaches a persistent `scratch-ai` Zellij session using `layouts/scratch-ai.kdl`.

From inside an existing Zellij session:

```bash
npm run zellij:pane
```

This is only a best-effort helper for adding Scratch AI to the current session. The layout session above is the more reliable daily workflow.

From outside Zellij, start or attach to the dedicated Scratch AI session:

```bash
npm run zellij:session
```

PowerShell shortcut:

```powershell
.\scripts\zai.ps1
```

Bash shortcut:

```bash
./scripts/zai.sh
```

For everyday use, add one of these aliases to your shell profile.

PowerShell:

```powershell
function zai { & "C:\path\to\ai-sidecar\scratch-ai\scripts\zai.ps1" }
```

Bash:

```bash
alias zai='/path/to/ai-sidecar/scratch-ai/scripts/zai.sh'
```

There are two ready-made layouts:

```text
layouts/scratch-ai.kdl
layouts/dev-with-scratch.kdl
```

`scratch-ai.kdl` is the permanent two-pane sidecar session. `dev-with-scratch.kdl` is a starter dev layout with a normal shell plus a suspended Scratch AI pane.

Run the sidecar session:

```bash
npm run zellij:session
```

Run the dev layout:

```bash
npm run zellij:dev
```

Raw Zellij equivalent:

```bash
zellij --session dev --new-session-with-layout ./layouts/dev-with-scratch.kdl
```

## Logs

Successful answers are appended to a daily JSONL file:

```text
~/dev-brain/inbox/YYYY-MM-DD.jsonl
```

Example line:

```json
{"timestamp":"2026-06-01T14:30:00.000Z","timezone":"Europe/Rome","project":"general","mode":"web","model":"gpt-5.1","question":"latest OpenAI Responses API web search syntax","answer":"...","durationMs":4321}
```

Errors are also logged when possible so the CLI can keep running.

## Log Explorer

`scratch-logs` is a read-only TUI for reviewing the JSONL archive. JSONL stays canonical; the explorer rebuilds or refreshes a local SQLite FTS5 index on startup.

```bash
scratch-logs
scratch-logs --query "sqlite fts" --limit 5
```

Environment:

```env
SCRATCH_AI_LOG_DIR=~/dev-brain/inbox
SCRATCH_AI_INDEX_PATH=~/dev-brain/scratch-ai.sqlite
```

If `SCRATCH_AI_INDEX_PATH` is unset, it defaults to `scratch-ai.sqlite` next to the log directory parent. For the default log directory, that is `~/dev-brain/scratch-ai.sqlite`.

Keys:

```text
type search text
up/down select or scroll detail
enter focus detail
tab cycle search/list/detail
m cycle mode
b cycle backend
p cycle project
d cycle date
r reindex
q quit from list/detail
ctrl+c quit anywhere
```

## Validation

```bash
npm run check
```

With an API key configured:

```bash
npm start
```

Then try:

```text
hello, what can you do?
/think compare JSONL vs SQLite for this scratch log
/web latest OpenAI Responses API web search tool syntax
/deepweb current state of terminal AI agents for developers
/exit
```
