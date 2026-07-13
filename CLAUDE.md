@AGENTS.md

# Standing rules for this repo

- NEVER commit directly to `main`; `main` is release-only.
- Base all work on `develop`; create a feature branch per task named
  `feat/<name>`, `fix/<name>`, or `chore/<name>`.
- Before each task: checkout `develop`, pull, then branch off it.
- Small commits, Conventional Commit messages.
- Never force-push, never rewrite shared history, never `git reset --hard` on
  unpushed work without asking first.
- If something seems to need touching `main`, STOP and ask.
- Follow `PROJECT_SPEC.md` for scope; do not add features it lists as non-goals.
- Money is always integer minor units (paise); never use floats/`parseFloat` for money.
- Ledger entries are append-only; corrections are reversing entries, never edits/deletes.
- Ask before installing dependencies not already implied by the spec.
- Definition of done per task: `pnpm tsc --noEmit` and lint pass, and it runs
  locally against the docker Postgres.
