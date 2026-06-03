# sAIdecar

> A lightweight terminal AI sidecar for quick developer questions inside Zellij. (Read the name as a mashup of **s**idecar + **AI**.)

It is intentionally not a coding agent. In direct OpenAI mode it does not scan repositories, read local files, run shell commands, or modify project files. In Codex mode it delegates the model call to `codex exec` so you can use Codex's Sign in with ChatGPT flow, while constraining Codex to an ephemeral read-only run outside the project directory.

`npm link` installs five commands: `saidecar`, `saidecar-logs`, `saidecar-digest`, `saidecar-doctor`, and `saidecar-zellij`. The package is unreleased, so there are no legacy `scratch-*` names to preserve.

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
- Per-stage response timing shown in the answer footer and `/status`

## Install

```bash
npm install
cp .env.example .env
npm link
```

Edit `.env` and choose `SAIDECAR_BACKEND=codex` or `SAIDECAR_BACKEND=openai` (the legacy `SCRATCH_AI_BACKEND` name is also accepted). Codex mode uses `codex login`; OpenAI mode requires `OPENAI_API_KEY`.

## Usage

```bash
saidecar
saidecar-logs
saidecar-digest
saidecar-doctor
saidecar-zellij
```

Open the log explorer directly:

```bash
saidecar-logs
```

Run environment checks:

```bash
saidecar-doctor
saidecar doctor
```

Generate a local Markdown review:

```bash
saidecar-digest
saidecar-digest --saved-only --write
```

For local development:

```bash
npm start
```

## Naming and storage

The CLI displays the brand as **sAIdecar** and uses the new storage layout by default:

| Concern | New default | Legacy location (auto-detected) |
|---------|-------------|---------------------------------|
| JSONL log directory | `~/.saidecar/logs/` | `~/dev-brain/inbox/` (kept if present) |
| SQLite FTS index | `~/.saidecar/saidecar.sqlite` | `~/dev-brain/scratch-ai.sqlite` (kept) |
| Annotations (favorites/tags) | `~/.saidecar/annotations/` | `~/dev-brain/annotations/` |
| Digest reviews (Markdown) | `~/.saidecar/sessions/` | `~/dev-brain/sessions/` |
| Env var prefix | `SAIDECAR_*` | `SCRATCH_AI_*` (still accepted) |
| Command name | `saidecar` (+ `saidecar-logs`, `saidecar-digest`, `saidecar-doctor`, `saidecar-zellij`) | n/a |

Resolution rules:

1. If `SAIDECAR_LOG_DIR` is set, it wins.
2. Else if `SCRATCH_AI_LOG_DIR` is set, it wins.
3. Else if `~/dev-brain/inbox/` already exists (from a prior install), it is reused — **no data loss**.
4. Else the new default `~/.saidecar/logs/` is used.

The SQLite index filename follows the log directory: legacy `dev-brain/inbox` keeps the existing `scratch-ai.sqlite` file; new installs get `saidecar.sqlite`. This means existing users do not need to reindex.

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

On startup, `saidecar` prints a Sidecar AI splash before the session metadata. The splash uses a block-letter logo with warm vintage color bands on `S` and `DECAR`, a grey gradient on `AI`, and the tagline:

```text
extra thinking room without taking the handlebars
```

Agent answers are rendered with terminal-friendly markdown styling. Headings, lists, task items, blockquotes, links, inline code, emphasis, and fenced code blocks are styled for readability in the pane. This only affects terminal display; the JSONL log keeps the raw markdown answer so citations, search, and later processing still have the original text.

## Session Context

sAIdecar includes recent turns from the current terminal session by default so short follow-up questions work naturally.

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
- per-stage breakdown of the last call (`login`, `cli`, `model` milliseconds) on the codex backend
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

With `SAIDECAR_BACKEND=codex` (legacy: `SCRATCH_AI_BACKEND=codex`), `/web` and `/deepweb` use the local Codex OAuth web-search bridge. It reads `~/.codex/auth.json`, calls the ChatGPT Codex search endpoint, and returns cited answers when the endpoint provides citations.

The bridge adapts the MIT-licensed approach used by `pi-codex-search`; see `THIRD_PARTY_NOTICES.md`.

## Configuration

The full env-var reference lives in `.env.example`. The new prefix is `SAIDECAR_*`; the legacy `SCRATCH_AI_*` names are still honored for backward compatibility (the `SAIDECAR_*` value wins if both are set).

```env
# Provider selection
SAIDECAR_PROVIDER=openai      # openai, deepseek, anthropic, minimax
PROVIDER_API_KEY=                # API key for third-party providers (deepseek, anthropic)
PROVIDER_BASE_URL=              # Optional custom endpoint URL

# MiniMax OAuth (optional)
MINIMAX_API_KEY=                 # API key if not using mmx CLI
MINIMAX_BASE_URL=               # Optional (auto-detected from key prefix)
MINIMAX_AUTH_MODE=oauth         # "oauth" (default) or "api_key"

# Backend
SAIDECAR_BACKEND=openai        # openai or codex

# OpenAI (when SAIDECAR_PROVIDER=openai)
OPENAI_API_KEY=

# Models
SAIDECAR_MODEL=gpt-5.4-mini
SAIDECAR_THINK_MODEL=gpt-5.4-mini

# Thinking display (for models like MiniMax-M3 that output thinking)
SAIDECAR_SHOW_THINKING=false    # true to show thinking blocks, false to hide (default: false)

# Codex
SAIDECAR_CODEX_COMMAND=codex
SAIDECAR_CODEX_TIMEOUT_MS=120000

# Storage
# Defaults: ~/.saidecar/logs + ~/.saidecar/saidecar.sqlite
# Legacy (auto-detected when present): ~/dev-brain/inbox + ~/dev-brain/scratch-ai.sqlite
#SAIDECAR_LOG_DIR=~/.saidecar/logs
#SAIDECAR_INDEX_PATH=~/.saidecar/saidecar.sqlite
SAIDECAR_PROJECT=general
SAIDECAR_TIMEZONE=Europe/Rome

# Auto-Filter (optional)
SAIDECAR_AUTO_FILTER=true      # Enable LLM-based entry scoring

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

Run `saidecar-doctor` to verify SearXNG is reachable.

### Provider Setup

**OpenAI** (default):
```env
SAIDECAR_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
```

**DeepSeek** (affordable OpenAI-compatible):
```env
SAIDECAR_PROVIDER=deepseek
PROVIDER_API_KEY=sk-...
```

**Anthropic Claude**:
```env
SAIDECAR_PROVIDER=anthropic
PROVIDER_API_KEY=sk-ant-...
```

**MiniMax** (requires `mmx-cli` for OAuth or API key):
```env
SAIDECAR_PROVIDER=minimax
MINIMAX_API_KEY=sk-...          # Optional if using mmx OAuth
MINIMAX_BASE_URL=              # Optional (auto-detected from key prefix)
```

To use MiniMax with OAuth authentication:
```bash
npm install -g mmx-cli
mmx auth login
```

This will open a browser for sign-in. After authentication, sAIdecar will automatically detect and use the mmx credentials.

The model defaults are conservative examples. Override them if your account uses different model names.

### Auto-Filter

When `SAIDECAR_AUTO_FILTER=true`, each logged Q&A entry is scored by a lightweight model in the background. Scoring is **non-blocking** - it does not slow down your session.

**Scoring categories:**
- `keep` - Code snippets, references, decisions, complex explanations
- `condense` - One-line summary saved instead of full conversation
- `discard` - Trivial questions, chitchat, repeated queries

The scoring uses the same provider configured via `SAIDECAR_PROVIDER`. Results are logged to the console for visibility:

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
SAIDECAR_BACKEND=codex
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
saidecar-zellij
```

This creates or attaches a persistent `saidecar` Zellij session using `layouts/saidecar.kdl`. The default session opens two panes: `saidecar` on the left and `saidecar-logs` on the right.

Dev layout from any directory:

```bash
saidecar-zellij dev dev-with-saidecar.kdl
```

Direct CLIs from anywhere:

```bash
saidecar
saidecar-logs
```

You can also run through npm from this repo.

Recommended daily command:

```bash
npm run zellij:session
```

This creates or attaches a persistent `saidecar` Zellij session using `layouts/saidecar.kdl`.

From inside an existing Zellij session:

```bash
npm run zellij:pane
```

This is only a best-effort helper for adding sAIdecar to the current session. The layout session above is the more reliable daily workflow.

From outside Zellij, start or attach to the dedicated sAIdecar session:

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
function zai { & "<path-to-repo>\scratch-ai\scripts\zai.ps1" }
```

Bash:

```bash
alias zai='<path-to-repo>/scratch-ai/scripts/zai.sh'
```

There are two ready-made layouts:

```text
layouts/saidecar.kdl
layouts/dev-with-saidecar.kdl
```

`saidecar.kdl` is the permanent two-pane sidecar session. `dev-with-saidecar.kdl` is a starter dev layout with a normal shell plus a suspended sAIdecar pane.

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
zellij --session dev --new-session-with-layout ./layouts/dev-with-saidecar.kdl
```

## Logs

Successful answers are appended to a daily JSONL file under `SAIDECAR_LOG_DIR`. The default location on a new install is:

```text
~/.saidecar/logs/YYYY-MM-DD.jsonl
```

On a legacy install that already had `~/dev-brain/inbox/`, that directory is reused transparently (no data move). See [Naming and storage](#naming-and-storage) for the resolution rules.

Example line:

```json
{"timestamp":"2026-06-01T14:30:00.000Z","timezone":"Europe/Rome","project":"general","mode":"web","model":"gpt-5.1","question":"latest OpenAI Responses API web search syntax","answer":"...","durationMs":4321}
```

Errors are also logged when possible so the CLI can keep running.

## Log Explorer

`saidecar-logs` is a read-only TUI for reviewing the JSONL archive. JSONL stays canonical; the explorer rebuilds or refreshes a local SQLite FTS5 index on startup.

```bash
saidecar-logs
saidecar-logs --query "sqlite fts" --limit 5
saidecar-logs --query "sqlite fts" --format markdown
saidecar-logs --date today --format markdown
saidecar-logs --saved --tag laravel --format markdown
```

Environment:

```env
SAIDECAR_LOG_DIR=~/.saidecar/logs
SAIDECAR_INDEX_PATH=~/.saidecar/saidecar.sqlite
SAIDECAR_ANNOTATION_DIR=~/.saidecar/annotations
SAIDECAR_SESSION_DIR=~/.saidecar/sessions
```

If `SAIDECAR_INDEX_PATH` is unset, it defaults to `saidecar.sqlite` next to the log directory parent. For the default log directory, that is `~/.saidecar/saidecar.sqlite`. On legacy installs that reused `~/dev-brain/inbox/`, the existing `~/dev-brain/scratch-ai.sqlite` is kept untouched. See [Naming and storage](#naming-and-storage) for the full resolution rules.

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

JSONL files are the canonical log. SQLite FTS5 is a **derived search index** - it is built on first query and incrementally updated when files change. You can delete the index file at any time; it rebuilds automatically from the JSONL archive.

| File | Purpose | Lifespan |
|------|---------|----------|
| `YYYY-MM-DD.jsonl` | Canonical log | Append-only, permanent |
| `saidecar.sqlite` (new) or `scratch-ai.sqlite` (legacy) | Search index (FTS5 + structured fields: decision, code, language, topic, importance) | Rebuildable cache |
| `annotations/*.jsonl` | Favorites/tags | Append-only |

The index auto-refreshes when you run `saidecar-logs` or `saidecar-digest`. Press `r` in the log explorer to force a manual reindex.

## Saved Entries And Tags

Raw Q&A logs stay append-only under `SAIDECAR_LOG_DIR` (legacy: `SCRATCH_AI_LOG_DIR`). Favorites, tags, and notes are stored separately as append-only JSONL under:

```text
~/.saidecar/annotations/YYYY-MM-DD.jsonl   # new default
# or
~/dev-brain/annotations/YYYY-MM-DD.jsonl   # legacy default
```

From the active CLI session, use `/history` to find a recent question index, then:

```text
/save 3 laravel queues
/tag 3 ops
```

In `saidecar-logs`, press `f` to favorite the selected entry.

## Digest

`saidecar-digest` creates an explicit local review of a day of sAIdecar logs. It is deterministic and local-first; it does not call a model.

```bash
saidecar-digest
saidecar-digest --date 2026-06-01
saidecar-digest --saved-only
saidecar-digest --write
saidecar-digest --dry-run
```

With `--write`, Markdown is saved under `SAIDECAR_SESSION_DIR`. On a new install that resolves to:

```text
~/.saidecar/sessions/YYYY-MM-DD.md
```

A legacy install that already had `~/dev-brain/sessions/` continues to use that directory.

The digest surfaces structured fields extracted by the index:

- `## Possible Decisions` is driven by the `isDecision` flag (with a regex safety-net)
- `## Topics` lists each topic with its count (e.g. `iron-anchor: 7`)
- `## High-Importance Entries` lists entries scored `importance=high`

### Weekly Digest

`saidecar-digest --weekly` renders a Mon-Sun digest (ISO weeks) covering the current week by default. Output is **rule-based and deterministic** — the same input always produces the same report.

```bash
saidecar-digest --weekly
saidecar-digest --weekly --project iron-anchor
saidecar-digest --weekly --week-of 2026-06-03          # pick a week by any date in it
saidecar-digest --weekly --weeks-ago 1                 # previous week
saidecar-digest --weekly --write                       # save to weekly-YYYY-Www.md
saidecar-digest --weekly --summary                     # add an LLM narrative
```

With `--write`, the file is saved under `SAIDECAR_SESSION_DIR` (legacy: `SCRATCH_AI_SESSION_DIR`) as:

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

Pass `--summary` (or set `SAIDECAR_WEEKLY_SUMMARY=true` in `.env`) to prepend a 3-5 bullet narrative generated by the active LLM provider. The deterministic body is always built first, so the summary is just decoration and can never block or replace the report. If the LLM call fails, the digest is still printed without a summary.

#### Optional startup auto-prompt

Set `SAIDECAR_WEEKLY_AUTO=true` to have `saidecar-digest` check the most recent weekly on startup. The rule is simple: **a weekly is fresh only if it covers the current ISO week**; anything older (including last week) is stale.

- **Interactive TTY** → prompts: `Last weekly digest: 2026-W22 (5 days ago). Generate 2026-W23 now? [Y/n]`. Press `n` (or just hit Enter — `Y` is the default) to skip.
- **Non-interactive (CI/cron/redirected)** → prints a one-liner with the pending week and exits. Pass `--yes` to auto-generate without prompting.
- **Already fresh** → prints `Weekly digest 2026-W23 is up to date (today).` and moves on.

The check is skipped automatically for `--weekly` (you're already generating), `--dry-run` (no side effects), and `--no-weekly-check` (opt out for one run).

```bash
# Interactive
SAIDECAR_WEEKLY_AUTO=true saidecar-digest

# Cron / Task Scheduler — auto-yes
SAIDECAR_WEEKLY_AUTO=true saidecar-digest --yes

# Skip the check for one run
saidecar-digest --no-weekly-check
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

These are **rule-based and deterministic** — no LLM calls, no extra cost, works on every entry including old ones. Fields are recomputed on every `refreshIndex()`, so you can simply delete the index file to force a full backfill:

```bash
# New default
rm -f ~/.saidecar/saidecar.sqlite*
node ./bin/saidecar-logs.js

# Legacy default (~/dev-brain/inbox from a prior install)
rm -f ~/dev-brain/scratch-ai.sqlite*
node ./bin/saidecar-logs.js
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

`saidecar-doctor` checks Node.js, `node:sqlite`, backend configuration, Codex auth file presence when `SAIDECAR_BACKEND=codex` (legacy: `SCRATCH_AI_BACKEND=codex`), and writable log/index/annotation directories.

```bash
saidecar-doctor
saidecar doctor
```

## Validation

```bash
npm run check
```

With an API key configured:

```bash
npm start
```

## Performance

Every answer prints a per-stage timing breakdown in the footer, so you can see where the time is going on slow calls:

```text
[done 14s | login=0ms cli=1.2s model=12.4s | tokens=320]
```

| Stage | What it measures | Where the time goes |
|-------|------------------|---------------------|
| `login` | `codex login status` check | First call only (~1-2s); cached for 10 min on the codex backend |
| `cli` | Codex CLI process startup to first stdout byte | Cold-start of the `codex` binary + its own OAuth/auth handshake |
| `model` | First byte to close — the actual model generation | TTFT + token generation on the model side |
| `tokens` | Total token usage from the API (when the backend reports it) | — |

### Codex login cache

On the `codex` backend, every request used to spawn a `codex login status` subprocess to verify auth (~1-2s). That check is now cached in memory for **10 minutes** (constant `LOGIN_CHECK_TTL_MS` in `src/codexClient.js`). The first call in a session still runs the check; subsequent calls within 10 min skip the subprocess. In-flight requests are de-duplicated, so two simultaneous questions share one login check.

If you want to force a fresh check (e.g. after `codex login` in another terminal), the cache resets when the process restarts. There is no env-var override — restart the CLI to flush.

### Model selection for latency

Default `gpt-5.4-mini` is the current OpenAI "strongest mini" model and is the best choice for fast Q&A. If a request is consistently slow:

1. Check the `[done ... | login=... cli=... model=...]` line to see which stage dominates.
2. If `model` is large (≥10s), try `gpt-5.4-nano` for cheaper/faster responses, or switch backend to a provider with lower round-trip latency (MiniMax M2.7 is reported at ~2-3s end-to-end).
3. If `cli` is large (>3s on every call), check that the `codex` binary is on `PATH` and not being re-resolved through `cmd.exe` on Windows.
4. The `login` value is the easiest win — it should be `0ms` on warm cache. If you see `login=1500ms` on every call, the cache is being invalidated more often than expected (e.g. by restarting the CLI between questions).

### Known follow-up

Streaming the `codex exec --json` event stream (token-by-token output) is the largest remaining perceived-perf win on the codex backend. It is tracked as a follow-up to task #24 and is not in the current release.

Then try:

```text
hello, what can you do?
/think compare JSONL vs SQLite for this scratch log
/web latest OpenAI Responses API web search tool syntax
/deepweb current state of terminal AI agents for developers
/exit
```

## License

Released under the [MIT License](../LICENSE). See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for upstream attributions.

## Contributing

Bug reports, fixes, and focused PRs are welcome. See [CONTRIBUTING.md](../CONTRIBUTING.md) for workflow, testing, and commit conventions, and the `_documentation/CHANGELOGS/` directory for dated change notes.
