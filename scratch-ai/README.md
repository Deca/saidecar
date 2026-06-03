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
- Structured indexing (decision / code / language / topic / importance) per entry
- Saved/favorited/tagged log annotations
- On-demand Markdown review/digest generation (with topic and high-importance sections)
- Weekly digest with optional LLM-generated narrative summary
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
# Provider selection
SCRATCH_AI_PROVIDER=openai      # openai, deepseek, anthropic, minimax
PROVIDER_API_KEY=                # API key for third-party providers (deepseek, anthropic)
PROVIDER_BASE_URL=              # Optional custom endpoint URL

# MiniMax OAuth (optional)
MINIMAX_API_KEY=                 # API key if not using mmx CLI
MINIMAX_BASE_URL=               # Optional (auto-detected from key prefix)
MINIMAX_AUTH_MODE=oauth         # "oauth" (default) or "api_key"

# Backend
SCRATCH_AI_BACKEND=openai        # openai or codex

# OpenAI (when SCRATCH_AI_PROVIDER=openai)
OPENAI_API_KEY=

# Models
SCRATCH_AI_MODEL=gpt-4o-mini
SCRATCH_AI_THINK_MODEL=gpt-4o-mini

# Thinking display (for models like MiniMax-M3 that output thinking)
SCRATCH_AI_SHOW_THINKING=false    # true to show thinking blocks, false to hide (default: false)

# Codex
SCRATCH_AI_CODEX_COMMAND=codex
SCRATCH_AI_CODEX_TIMEOUT_MS=120000

# Storage
SCRATCH_AI_LOG_DIR=~/dev-brain/inbox
SCRATCH_AI_INDEX_PATH=~/dev-brain/scratch-ai.sqlite
SCRATCH_AI_PROJECT=general
SCRATCH_AI_TIMEZONE=Europe/Rome

# Auto-Filter (optional)
SCRATCH_AI_AUTO_FILTER=true      # Enable LLM-based entry scoring

# Web Search (SearXNG, self-hosted)
SEARXNG_URL=http://localhost:8080   # Default SearXNG instance URL
SEARXNG_ENGINES=bing,mojeek,presearch,wikipedia  # Engines to use (comma-separated)
```

### Web Search Setup (SearXNG)

The `/web` and `/deepweb` modes use [SearXNG](https://github.com/searxng/searxng) for web search. You need to run your own SearXNG instance:

```bash
# Run SearXNG with Docker (recommended)
docker run -d --name searxng -p 8080:8080 \
  -e SEARXNG_SECRET=$(openssl rand -hex 16) \
  -e SEARXNG_LIMITER=false \
  searxng/searxng

# Or with docker-compose - see https://docs.searxng.org/admin/installation-docker.html
```

Then set in `.env`:
```env
SEARXNG_URL=http://localhost:8080
SEARXNG_ENGINES=bing,mojeek,presearch,wikipedia
```

The default engines (google, duckduckgo, brave) are commonly rate-limited. We pin to engines that actually respond. You can customize via `SEARXNG_ENGINES`.

Run `scratch-doctor` to verify SearXNG is reachable.

### Provider Setup

**OpenAI** (default):
```env
SCRATCH_AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
```

**DeepSeek** (affordable OpenAI-compatible):
```env
SCRATCH_AI_PROVIDER=deepseek
PROVIDER_API_KEY=sk-...
```

**Anthropic Claude**:
```env
SCRATCH_AI_PROVIDER=anthropic
PROVIDER_API_KEY=sk-ant-...
```

**MiniMax** (requires `mmx-cli` for OAuth or API key):
```env
SCRATCH_AI_PROVIDER=minimax
MINIMAX_API_KEY=sk-...          # Optional if using mmx OAuth
MINIMAX_BASE_URL=              # Optional (auto-detected from key prefix)
```

To use MiniMax with OAuth authentication:
```bash
npm install -g mmx-cli
mmx auth login
```

This will open a browser for sign-in. After authentication, scratch-ai will automatically detect and use the mmx credentials.

The model defaults are conservative examples. Override them if your account uses different model names.

### Auto-Filter

When `SCRATCH_AI_AUTO_FILTER=true`, each logged Q&A entry is scored by a lightweight model in the background. Scoring is **non-blocking** - it does not slow down your session.

**Scoring categories:**
- `keep` - Code snippets, references, decisions, complex explanations
- `condense` - One-line summary saved instead of full conversation
- `discard` - Trivial questions, chitchat, repeated queries

The scoring uses the same provider configured via `SCRATCH_AI_PROVIDER`. Results are logged to the console for visibility:

```
[auto-filter] keep: how to use git rebase safely...
[auto-filter] condense: what time is it
[auto-filter] discard: hi
```

Manual saves via `/save` always force keep-as-is regardless of auto-filter decision.

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
i cycle importance (all → high → medium → low)
n toggle code-only
s toggle saved-only
f favorite/save selected entry
r reindex
q quit from list/detail
ctrl+c quit anywhere
```

Each result row also shows a code indicator (`<>`) and an importance badge (`!!` for high, `!` for medium). The header line always reflects the current filter state, e.g. `mode=all backend=all project=all date=all saved=no tag=all importance=high code=yes`.

## Index Architecture

JSONL files are the canonical log. SQLite FTS5 is a **derived search index** - it is built on first query and incrementally updated when files change. You can delete `scratch-ai.sqlite` at any time; it rebuilds automatically from the JSONL archive.

| File | Purpose | Lifespan |
|------|---------|----------|
| `YYYY-MM-DD.jsonl` | Canonical log | Append-only, permanent |
| `scratch-ai.sqlite` | Search index (FTS5 + structured fields: decision, code, language, topic, importance) | Rebuildable cache |
| `annotations/*.jsonl` | Favorites/tags | Append-only |

The index auto-refreshes when you run `scratch-logs` or `scratch-digest`. Press `r` in the log explorer to force a manual reindex.

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

The digest surfaces structured fields extracted by the index:

- `## Possible Decisions` is driven by the `isDecision` flag (with a regex safety-net)
- `## Topics` lists each topic with its count (e.g. `iron-anchor: 7`)
- `## High-Importance Entries` lists entries scored `importance=high`

### Weekly Digest

`scratch-digest --weekly` renders a Mon-Sun digest (ISO weeks) covering the current week by default. Output is **rule-based and deterministic** — the same input always produces the same report.

```bash
scratch-digest --weekly
scratch-digest --weekly --project iron-anchor
scratch-digest --weekly --week-of 2026-06-03          # pick a week by any date in it
scratch-digest --weekly --weeks-ago 1                 # previous week
scratch-digest --weekly --write                       # save to weekly-YYYY-Www.md
scratch-digest --weekly --summary                     # add an LLM narrative
```

With `--write`, the file is saved under `SCRATCH_AI_SESSION_DIR` as:

```text
weekly-2026-W23.md
```

The weekly report includes:

- Activity stats (total entries, by day, by project, by mode)
- Topics (with counts)
- Languages (with counts, when code is present)
- Key decisions (top 12, driven by `isDecision`)
- Code snippets (count + top 8, with detected language)
- High-importance entries
- Saved/favorited entries

#### Optional LLM summary

Pass `--summary` (or set `SCRATCH_AI_WEEKLY_SUMMARY=true` in `.env`) to prepend a 3-5 bullet narrative generated by the active LLM provider. The deterministic body is always built first, so the summary is just decoration and can never block or replace the report. If the LLM call fails, the digest is still printed without a summary.

#### Optional startup auto-prompt

Set `SCRATCH_AI_WEEKLY_AUTO=true` to have `scratch-digest` check the most recent weekly on startup. The rule is simple: **a weekly is fresh only if it covers the current ISO week**; anything older (including last week) is stale.

- **Interactive TTY** → prompts: `Last weekly digest: 2026-W22 (5 days ago). Generate 2026-W23 now? [Y/n]`. Press `n` (or just hit Enter — `Y` is the default) to skip.
- **Non-interactive (CI/cron/redirected)** → prints a one-liner with the pending week and exits. Pass `--yes` to auto-generate without prompting.
- **Already fresh** → prints `Weekly digest 2026-W23 is up to date (today).` and moves on.

The check is skipped automatically for `--weekly` (you're already generating), `--dry-run` (no side effects), and `--no-weekly-check` (opt out for one run).

```bash
# Interactive
SCRATCH_AI_WEEKLY_AUTO=true scratch-digest

# Cron / Task Scheduler — auto-yes
SCRATCH_AI_WEEKLY_AUTO=true scratch-digest --yes

# Skip the check for one run
scratch-digest --no-weekly-check
```

## Structured Indexing

Every entry is enriched with five structured fields at index time, so you can filter and group precisely instead of relying only on free-text search.

| Field | Type | Source |
|-------|------|--------|
| `isDecision` | boolean | Keyword/regex scan of question + answer |
| `isCodeSnippet` | boolean | Fenced code blocks, multiple inline code spans, or code-like lines |
| `language` | string | First code-fence language (normalized: `py→python`, `ts→typescript`, …) |
| `topic` | string | `Topic:` prefix, first `#hashtag` in the question, or the project name |
| `importance` | `low` / `medium` / `high` | Scored from decision + code + sources + length |

These are **rule-based and deterministic** — no LLM calls, no extra cost, works on every entry including old ones. Fields are recomputed on every `refreshIndex()`, so you can simply delete `scratch-ai.sqlite*` to force a full backfill:

```bash
rm -f ~/dev-brain/scratch-ai.sqlite*
node ./bin/scratch-logs.js
```

The SQLite schema is auto-migrated: new columns (`is_decision`, `is_code_snippet`, `topic`, `language`, `importance`) and indexes are added on first open.

### Programmatic access

```js
import { searchEntries, getFilterOptions } from "./src/logIndex.js";

const highImportance = searchEntries({ importance: "high", limit: 20 });
const codeOnly = searchEntries({ codeOnly: true, language: "python" });
const decisions = searchEntries({ decisionOnly: true, date: "7d" });

const options = getFilterOptions();
// { modes: [...], backends: [...], projects: [...],
//   topics: [...], languages: [...], importances: [...], tags: [...] }
```

See `src/structuredExtract.js` for the extraction rules and `src/logIndex.js` for the filter SQL.

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
