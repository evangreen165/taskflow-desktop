# AI Working Instructions

This file is read by AI agents working on TaskFlow. Follow it in addition to
`AGENTS.md` and the repository conventions.

## Work reports (required)

- Every stage or step gets a **detailed Markdown report** in `docs/reports/`.
- Naming: `stage<N>-<step>-<slug>.md` (e.g. `stage7-1-search.md`,
  `stage6-spaces.md`). Use `fix-<slug>.md` for standalone fixes.
- Each report must cover:
  1. Goal / scope.
  2. What changed, with the important files and commands.
  3. Design decisions and trade-offs.
  4. Tests and gates actually run (with results).
  5. Known limitations / follow-ups.
  6. Commit hashes and the branch.
- The chat response is a **brief summary only**; details belong in the report.
- Update the report when follow-up fixes change the behaviour described there.

## Commit conventions

- Stage work: `stage<N>(<step>): <short summary>`
- Standalone fixes: `fix: <short summary>`
- Release docs: `docs: release <version> (<stage name>)`
- Do not commit, merge, tag, or release unless explicitly asked.

## Quality gates

Before committing stage work, run and report:

```bash
cargo test        # from src-tauri/
npm run test
npm run lint
npm run build
```

## Documentation

- User-facing behaviour and security notes go in `README.md`.
- Version history goes in `CHANGELOG.md` (`[Unreleased]` while in development).
- Reports are historical records; do not rewrite them except to correct errors
  or add follow-up notes.
