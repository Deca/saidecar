# Contributing to sAIdecar

Thanks for your interest in contributing. sAIdecar is intentionally a small
sidecar for quick developer Q&A inside a Zellij pane. The product is **not** a
coding agent — please keep that scope in mind when proposing changes.

## Quick start

```bash
git clone <repo-url>
cd ai-sidecar
npm install
cp scratch-ai/.env.example scratch-ai/.env
# edit scratch-ai/.env to add OPENAI_API_KEY (or set SAIDECAR_BACKEND=codex)
npm test
npm start
```

## Workflow

1. **Branch from `main`.** Use a short kebab-case name:
   - `feat/<topic>` for new features
   - `fix/<topic>` for bug fixes
   - `refactor/<topic>` for non-behavior refactors
   - `chore/<topic>` for docs, repo hygiene, tooling
   - `docs/<topic>` for documentation only
2. **Keep changes focused.** One logical change per branch/PR.
3. **Validate before pushing.** From the repo root:
   ```bash
   npm run check   # syntax check on every .js entry point
   npm test        # 100+ unit tests
   ```
4. **Use Conventional Commits** for commit messages:
   `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`.
5. **Do not commit secrets or local paths.** `.env`, `node_modules/`, generated
   logs, and the SQLite index are all gitignored — keep it that way.

## Code conventions

- **ESM only.** Use `import` / `export`, not `require`.
- **Node 20+** features are fine (we rely on `node:sqlite` and built-in
  `node:test`).
- **Keep public contracts small.** The CLI bins and the exported functions of
  `src/logIndex.js`, `src/logParser.js`, `src/modes.js`, and
  `src/logExplorerApp.js` are the public surface.
- **Determinism first.** Anything that reads from the index, log files, or
  config must work the same way on every machine. Provider calls are the
  exception; isolate them behind `src/modelClient.js` and `src/providers/`.
- **No drive-by refactors.** If a refactor is needed to land a feature, split
  it into a separate commit or PR.
- **Comments are sparse.** Add a comment only when the _why_ is non-obvious.
  Do not restate the code.

## Testing

- Tests live in `scratch-ai/test/` and use the built-in `node:test` runner.
- Name files `<module>.test.js`.
- Live network calls (OpenAI, Codex, MiniMax, Anthropic, SearXNG) are not
  part of the automated test suite. Cover them with fake servers or skip with
  a clear reason.
- When you add a feature, add at least one unit test that exercises the new
  function directly.

## Documentation

If your change is user-visible, adds a new feature, or changes a public
contract, add a dated changelog entry under
`_documentation/CHANGELOGS/DD-MM-YYYY-short-summary.md` using the
`feature-documentation` skill template. Keep it factual: what changed, why,
and how it was verified.

## Pull request checklist

- [ ] Branch name follows the conventions above
- [ ] `npm run check` passes locally
- [ ] `npm test` passes locally (no new failures)
- [ ] New behavior has at least one unit test
- [ ] No secrets, no personal paths, no generated artifacts in the diff
- [ ] Conventional Commit message in the title or summary
- [ ] Changelog entry added if the change is user-visible

## Reporting security issues

Please do not open a public issue for security-sensitive reports. Contact the
maintainer privately first so we can coordinate a fix and a disclosure plan.
