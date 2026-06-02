# Scratch AI

A lightweight terminal AI sidecar for quick developer questions inside Zellij.

It is intentionally not a coding agent. In direct OpenAI mode it does not scan repositories, read local files, run shell commands, or modify project files. In Codex mode it delegates the model call to `codex exec` so you can use Codex's Sign in with ChatGPT flow, while constraining Codex to an ephemeral read-only run outside the project directory.

## Features

- Interactive terminal prompt
- Markdown-styled answer rendering in the terminal
- Normal fast Q&A
- `/think` reasoning mode
- `/web` web-search mode
- `/deepweb` reasoning + web-search mode
- Local JSONL logging
- Read-only log explorer with SQLite FTS search
- Saved/favorited/tagged log annotations
- On-demand Markdown review/digest generation
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

Run environment checks:

```bash
scratch-doctor
scratch-ai doctor
```

Generate a local Markdown review:

```bash
scratch-digest
scratch-digest --saved-only --write
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
/context [on|off|status]
/save <history-index> [tag...]
/tag <history-index> <tag...>
/log
/clear
/reset
```

Normal input without a slash is treated as a fast question.

## Terminal Presentation

On startup, `scratch-ai` prints a Sidecar AI splash before the session metadata. The splash uses a block-letter logo with warm vintage color bands on `S` and `DECAR`, a grey gradient on `AI`, and the tagline:

```text
extra thinking room without taking the handlebars
```

Agent answers are rendered with terminal-friendly markdown styling. Headings, lists, task items, blockquotes, links, inline code, emphasis, and fenced code blocks are styled for readability in the pane. This only affects terminal display; the JSONL log keeps the raw markdown answer so citations, search, and later processing still have the original text.

## Session Context

Scratch AI includes recent turns from the current terminal session by default so short follow-up questions work naturally.

```text
/context
/context on
/context off
```

Context is intentionally local and temporary:

- only the current terminal session is used
- only the last few exchanges are sent
- old logs, saved entries, digests, files, and search results are not added automatically
- `/clear` only clears the terminal display
- `/reset` clears live history, counters, and follow-up context, but does not delete logs

## Session Info

Use `/status` to see the current terminal session:

- backend and active models
- current session context status
- estimated transcript size for the current terminal session
- exchange count, errors, web calls, and last latency
- API token usage when the direct OpenAI backend reports it
- current JSONL log file

Logs remain append-only. Resetting a session does not remove JSONL entries, SQLite index data, or saved/favorited/tagged annotations.

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
scratch-logs --query "sqlite fts" --format markdown
scratch-logs --date today --format markdown
scratch-logs --saved --tag laravel --format markdown
```

Environment:

```env
SCRATCH_AI_LOG_DIR=~/dev-brain/inbox
SCRATCH_AI_INDEX_PATH=~/dev-brain/scratch-ai.sqlite
SCRATCH_AI_ANNOTATION_DIR=~/dev-brain/annotations
SCRATCH_AI_SESSION_DIR=~/dev-brain/sessions
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
g cycle tag
s toggle saved-only
f favorite/save selected entry
r reindex
q quit from list/detail
ctrl+c quit anywhere
```

## Saved Entries And Tags

Raw Q&A logs stay append-only under `SCRATCH_AI_LOG_DIR`. Favorites, tags, and notes are stored separately as append-only JSONL under:

```text
~/dev-brain/annotations/YYYY-MM-DD.jsonl
```

From the active CLI session, use `/history` to find a recent question index, then:

```text
/save 3 laravel queues
/tag 3 ops
```

In `scratch-logs`, press `f` to favorite the selected entry.

## Digest

`scratch-digest` creates an explicit local review of a day of Scratch AI logs. It is deterministic and local-first; it does not call a model.

```bash
scratch-digest
scratch-digest --date 2026-06-01
scratch-digest --saved-only
scratch-digest --write
scratch-digest --dry-run
```

With `--write`, Markdown is saved under:

```text
~/dev-brain/sessions/YYYY-MM-DD.md
```

## Doctor

`scratch-doctor` checks Node.js, `node:sqlite`, backend configuration, Codex auth file presence when `SCRATCH_AI_BACKEND=codex`, and writable log/index/annotation directories.

```bash
scratch-doctor
scratch-ai doctor
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
