# Delta fix: first release failed at "Commit and tag"

## Root cause

The first run of `release.yml` has no previous tag, so the version is whatever `package.json` already says (1.0.0) and the seeded 1.0.0 entry in `CHANGELOG.md` is kept. The apply step therefore changes no tracked file, and `git commit` exits 1 with "nothing added to commit". Every later release does change both files, which is why only the first run hit it.

Nothing was pushed by the failed run: no commit, no tag, no images, no GitHub Release. The repository state is clean. Re-running the failed job will **not** help, because it reuses the broken workflow from that commit; the fix has to be merged to `main`, and that merge starts a fresh release run.

## The change (3 lines of logic, 1 regression test)

```diff
diff --git a/.github/workflows/release.yml b/.github/workflows/release.yml
index 199c2ef..92e1ef9 100644
--- a/.github/workflows/release.yml
+++ b/.github/workflows/release.yml
@@ -68,7 +68,12 @@ jobs:
           git config user.name "github-actions[bot]"
           git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
           git add package.json CHANGELOG.md
-          git commit -m "chore(release): v${VERSION} [skip ci]"
+          # First release ships the seeded 1.0.0 entry, so there may be nothing to commit: tag the current commit.
+          if git diff --cached --quiet; then
+            echo "No version or changelog changes; tagging the current commit"
+          else
+            git commit -m "chore(release): v${VERSION} [skip ci]"
+          fi
           git tag -a "v${VERSION}" -m "v${VERSION}"
       - name: Push release commit and tag (fails early if the ruleset bypass is missing)
         run: git push origin HEAD:main --follow-tags
```

Plus `tools/release.spec.mjs`: a new test that extracts the real "Commit and tag" step from `release.yml` and runs it in a scratch git repository for both cases (first release with no file changes, later release with changes). It fails on the old workflow and passes on the new one. Nothing else changed, so everything that already worked is untouched.

## Steps (feature branch, pull request, merge, release)

### 1. Confirm a clean starting point

```bash
git switch main && git pull --ff-only
git ls-remote --tags origin          # expect no output: no tag was created
gh run list --workflow release.yml --limit 3
```

### 2. Cut the feature branch

```bash
git switch -c fix/release-first-run-nothing-to-commit
```

### 3. Apply the fix

```bash
git apply --check fix-release-first-run.patch && git apply fix-release-first-run.patch
```

If your files differ from mine and the patch does not apply, make the single edit by hand: in `.github/workflows/release.yml`, step "Commit and tag", replace the `git commit ...` line with the `if git diff --cached --quiet; ... fi` block shown in the diff above, then add the new test from the patch to `tools/release.spec.mjs`.

### 4. Verify locally

```bash
npm run test:tools      # 5 tests pass (4 before + the new regression test)
npx prettier --check tools .github/workflows
git diff --stat         # expect exactly: release.yml, release.spec.mjs
```

### 5. Commit with a Conventional Commit message and push

```bash
git add -A
git commit -m "fix(ci): tag current commit when the first release has nothing to commit"
git push -u origin fix/release-first-run-nothing-to-commit
```

### 6. Open the pull request

The PR title is what becomes the squash commit and drives the version, so it must be Conventional:

```bash
gh pr create --base main --title "fix(ci): tag current commit when the first release has nothing to commit" \
  --body "Release job failed on the first run: nothing to commit because package.json already matched 1.0.0 and the seeded changelog entry is kept. Commit only when staged changes exist; always tag. Adds a regression test that runs the real workflow step."
gh pr checks --watch
```

Expected: `guard`, `verify`, `e2e`, `docker`, `terraform`, `k8s` pass, and `ci-ok (required check)` goes green. (`nx affected` finds no affected Nx project for a tools and workflow change, so lint, typecheck, test and build are quick; `npm run test:tools` still runs the new test.)

### 7. Approval and merge

A code owner other than the author must approve (ruleset). Working alone: add a second collaborator, or temporarily use the solo option in WALKTHROUGH Part 9. Then:

```bash
gh pr review --approve            # run by the reviewer
gh pr merge --squash --delete-branch
git switch main && git pull --ff-only && git fetch --prune
```

Squash is the only allowed method and the branch is deleted automatically.

### 8. Release (this is the end-to-end test)

Merging pushes to `main`, which starts `release.yml` automatically:

1. **plan** runs and its summary shows `release=true`, `version=1.0.0`, `bump=initial`.
2. **publish** waits on the `release` environment. Open the run, **Review deployments**, tick `release`, **Approve and deploy**.
3. In **Commit and tag** the log now reads `No version or changelog changes; tagging the current commit`, then **Push** pushes tag `v1.0.0` (the ruleset bypass for the GitHub Actions app is exercised here; if you see GH013, use the `RELEASE_TOKEN` fallback in WALKTHROUGH Part 10).
4. Artifacts are attested, the GHCR images `...-bff` and `...-web` are pushed with `1.0.0` and `latest`, and the GitHub Release `v1.0.0` is created from the seeded changelog entry.

### 9. Verify the outcome

```bash
git ls-remote --tags origin                         # refs/tags/v1.0.0
gh release view v1.0.0 --json tagName,assets --jq '.tagName, [.assets[].name]'
gh run list --workflow release.yml --limit 2        # latest: success
node tools/release.mjs plan | head -1               # {"release":"false",...,"lastTag":"v1.0.0"}
```

### 10. Next releases (already covered by the same test)

A merged `feat(...)` PR produces `1.1.0`, a `fix(...)` produces `1.0.1`. Those runs change `package.json` and `CHANGELOG.md`, so the step commits `chore(release): vX.Y.Z [skip ci]`, tags that commit, and pushes both.

## Rehearsal evidence (run in a scratch repository with a bare origin)

| Step | Result |
|---|---|
| Regression test without the fix | fails (`nothing to commit`) |
| Regression test with the fix | 5 of 5 pass |
| Prettier and actionlint | clean |
| Squash merge, then `release.mjs plan` | `release=true, version=1.0.0, bump=initial` |
| Real step script, then push with `--follow-tags` | `No version or changelog changes; tagging the current commit`; `v1.0.0` landed on origin |
| `release.mjs plan` afterwards | `release=false, lastTag=v1.0.0` |

Not reproducible outside GitHub: the ruleset bypass on the push, the environment approval click, and the GHCR push. Those steps were not part of the failure and are unchanged.
