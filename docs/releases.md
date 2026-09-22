# Release and rollback

## Version policy

package.json is the version source; package-lock.json must match it. Use v0.MINOR.PATCH-alpha. Increment PATCH for fixes and MINOR for features; reset PATCH to zero for a minor release. Stable v1.0.0 requires an explicit release decision. Do not infer stability from successful tests.

- Work branch: codex/v0.2.0-alpha (or a short fix branch for an existing milestone).
- Preserved baseline: release/v0.1.0-alpha and annotated tag v0.1.0-alpha, both at 8e5bb21aa97344dff5d1c29826f71566b6f870f2.
- Milestone branch: release/vX.Y.Z-alpha. Tag: vX.Y.Z-alpha. Create these only for the tested commit. Never move an existing milestone to a newer commit.
- main is the production source. Feature pushes create Vercel previews; merging main triggers production through the existing Git integration.

## Pull request and deployment

1. Start from the current main in a new codex/ branch. Check git status first and preserve other work.
2. Implement changes, update the version/lockfile/changelog, and update AGENTS.md if requirements changed.
3. Run npm ci, npm run verify, and npm run test:e2e. Install Chromium once with npx playwright install chromium.
4. Push the branch normally and open a PR. CI uses read-only permissions and official Actions pinned to commit hashes. Quality gate checks formatting, source contracts, unit tests, the build, and Chromium desktop/mobile behavior. Failure artifacts and build metadata are kept for seven days.
5. Inspect the actual GitHub checks and Vercel preview. Verify build-info.json matches the commit and /api/time reports NTP or an explicit 503, never a false success. Browser tests mock time and do not establish real network synchronization.
6. Merge only after the required checks pass and the owner is ready. The Git integration deploys main; no extra Vercel token or duplicate deployment workflow is needed.
7. Preserve a tested milestone using an annotated tag and release branch. Annotate the release with the commit, checks, changes, and known limits. A tag is a code rollback point, not evidence of a production deployment.

Recommended GitHub main protection: required pull request, strict Quality gate status check, resolved review conversations, protections applied to admins, no force push, no deletion. A single-owner repository may use zero mandatory approvals while still requiring a PR and successful CI. Independent review can be added when another reviewer is available.

Protect release/* branches and v*-alpha tags against deletion and updates using GitHub rulesets. Creation must remain permitted. These are repository settings; verify their actual state with GitHub. The presence of this document or a workflow does not apply those settings.

The Vercel project must use the repository root, Other framework preset, Node.js 22.x, and the committed vercel.json commands without old project overrides. Install uses npm ci. The Vercel build runs source checks and unit tests before building. GitHub's required gate adds formatting and browser checks before production merge.

## Rollback without rewriting history

For a merged bad PR, open a revert PR using GitHub's Revert action, or use git revert on a new rollback branch. Reverting a merge commit requires the correct mainline parent; inspect the commit before choosing -m. Run the same checks, review the restored behavior, then merge the revert. Never reset or force push main.

For an urgent deployment rollback, select the last verified deployment through Vercel's rollback controls. Confirm its build metadata, test the reporting flow, and verify /api/time. Then open a Git revert PR so the next production build does not restore the regression. Available rollback controls depend on the Vercel project/account configuration.

To inspect an older milestone locally without changing main:

```sh
git switch -c codex/inspect-v0.1.0-alpha v0.1.0-alpha
npm run build
```

The baseline predates the lockfile and CI. Its build requires no installed dependencies. After a rollback, preserve its historical version label rather than claiming a newer version contains old behavior. New fixes get a new version/tag, never a replacement tag.

## Diagnosing a report or time issue

Capture the footer's version, commit, build time, sourceHash, browser, and a minimal non-sensitive reproduction. Do not paste operational readings or credentials into public issues.

NTP refresh logs are JSON records with event ntp.sync, timestamp, version, commit, status (ok/unavailable), source, attempts, and durationMs. A cache hit emits no new refresh event. Success with attempts 2 means fallback was used. Repeated unavailable results suggest blocked UDP 123, DNS, or time-source availability. Logs contain no request bodies or meter readings. The UI shows device/last-sample time when synchronization is unavailable, and manual entry remains possible.

Reference: [Vercel Git integration](https://vercel.com/docs/git/vercel-for-github), [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
