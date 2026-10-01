# Contributing

1. Branch from `main`; use Conventional Commits (`feat:`, `fix:`, `docs:` ...). The `commit-msg` hook enforces it.
2. **No change merges without regression tests.** See `WALKTHROUGH.md` Part 7 for the catalogue and how to add one.
3. Run `npm run verify` before pushing.
4. Open a pull request; CI job `ci-ok (required check)` must be green and a code owner must approve.
5. Use a Conventional Commit PR title. Never edit `CHANGELOG.md` or the version by hand: `release.yml` generates both after an approved release.
6. Do not add Dependabot or Renovate configuration; CI rejects it.
