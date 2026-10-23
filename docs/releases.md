# Release and rollback

## Version policy

package.json is the version source; package-lock.json must match it. Use v0.MINOR.PATCH-alpha. Continue PATCH for the current alpha improvements. Patch numbers are integers: 0.9.9 is followed by 0.9.10, then 0.9.11. A future minor milestone requires a deliberate scope decision. Beta and stable 1.0.0 require explicit release decisions. Do not infer stability from successful tests.

- Work branch: codex/v0.3.0-alpha (or a short fix branch for an existing milestone).
- Preserved baseline: release/v0.1.0-alpha and annotated tag v0.1.0-alpha, both at 8e5bb21aa97344dff5d1c29826f71566b6f870f2.
- Milestone branch: release/vX.Y.Z-alpha. Tag: vX.Y.Z-alpha. Create these only for the tested commit. Never move an existing milestone to a newer commit.
- main is the production source. Feature pushes create Vercel previews; merging main triggers production through the existing Git integration.

## Pull request and deployment

1. Start from the current main in a new codex/ branch. Check git status first and preserve other work.
2. Implement changes, update the version/lockfile/changelog, and update AGENTS.md if requirements changed.
3. Run npm ci, npm run verify, npm run test:integration against a test/development database, and npm run test:e2e. Install Chromium once with npx playwright install chromium.
4. Push the branch normally and open a PR. CI uses read-only permissions and official Actions pinned to commit hashes. Quality gate rejects high/critical dependency advisories with npm run security:audit and checks selected secret patterns, formatting, source contracts, unit tests, the build, and Chromium desktop/mobile behavior. Failure artifacts and build metadata are kept for seven days.
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

## Repository controls verified on 2026-09-22

For [PR #1](https://github.com/gedxxe/Midea-JRE-UNILAND-Waste-Calculator/pull/1), GitHub settings were applied and read back successfully:

- main requires a pull request, resolved conversations, and an up-to-date Quality gate check from the GitHub Actions app. Admins are included; force push and deletion are disabled. Mandatory approval count is zero for this single-owner repository.
- Active ruleset 23807503 prevents updates, force pushes, and deletion of release/* branches. New milestone branches may still be created.
- Active ruleset 23807504 prevents updates and deletion of v*-alpha tags. New release tags may still be created.
- The v0.1.0-alpha branch/tag are published at 8e5bb21. Vercel's Git integration successfully created the v0.2.0-alpha preview. Its runtime is protected by Vercel Authentication and requires an authorized account to inspect.

These are settings verified at that time, not immutable guarantees. Recheck GitHub settings if repository ownership, permissions, or workflow names change. PR #1 was verified merged into main at 1ba66634b03acf76b97f8b9a23f38275082366c0 on 2026-09-24. This does not independently prove the current production deployment.

## Database releases

v0.3.0-alpha adds PostgreSQL. See docs/accounts.md for environment separation, explicit migration/bootstrap, limited runtime grants, and recovery. A code rollback never deletes database records. Do not publish a milestone as production-ready until live account storage and its permissions have been verified.

## Shift utilities (v0.11.12-alpha)

Apply migration 006_shift_utilities.sql explicitly after a verified private backup and before the production merge. It extends the existing draft guard and adds a report-revision format guard, without rewriting readings or snapshots. New shift reports/drafts carry utilityLayout 1. Backup v4 retains period-owned gas, Water and manual entries and reads older files; older application versions reject v4 backups. A rollback keeps stored data but older writers cannot replace protected shift records. Use a compatible release to resume editing. Never remove guards or drop fields to force an older client to save. Production migration and merge need the owner's applicable authorization; builds do neither.

## JRE Forklift meter (v0.11.13-alpha)

JRE layout 5 adds one raw pair. No database migration is required. Existing layouts upgrade to a blank new pair, while stale report clients must reload and current-server draft writes cannot replace a stored layout 5 with an older layout. Keep a full private workspace backup before code rollback: older code cannot edit layout 5. Do not remove the new row to force an older client to save. Existing saved reports, utility layout 1 and backup v4 remain intact.

## Graph presentation (v0.11.14-alpha)

No database, account or report-format migration is required. This release reads legacy v1 graph layouts without overwriting them; new preferences use browser-local v2 keys. A code rollback restores the earlier graph interface and its v1 settings. New v2 titles, variables and bounds remain in the same browser for a compatible release to recover. Saved reports, utility layout 1, JRE layout 5 and backup v4 remain unchanged. Viewer accounts and shared dashboards are outside this release.

## Monitoring views (v0.11.15-alpha)

No database or report-format migration is required. Monthly tables and smooth/interactive graphs are views of existing saved graph values, without new persisted account or workspace fields. Layout preferences remain v2; legend visibility is temporary. A code rollback removes the new views and retains saved reports, JRE layout 5, utility layout 1 and backup v4. Use the existing release branch/tag workflow without replacing earlier milestones.

## Monitoring scroll fix (v0.11.16-alpha)

Presentation-only fix with no database migration, account configuration or persisted format changes. Full-window/filter state is temporary; close or account changes reset it. A normal revert PR can remove this change without rewriting saved reports or graph preferences. Returning to v0.11.15 also restores its known short-screen table bug, so prefer a forward fix. The CI job budget is 20 minutes to accommodate slow browser OS dependency downloads; audit, source, unit, integration and browser checks remain required.

## Welcome presentation (v0.11.17-alpha)

No database, account, reading-layout or persisted-preference migration. The optional animation module has no account/data access and failure does not block sign-in. A normal revert PR restores the v0.11.16 welcome screen while retaining its monthly-table scrolling fix and all saved data. Keep earlier tags/branches unchanged. The CI job allows 25 minutes because observed browser OS dependency downloads can take over 13 minutes before the full browser suite begins; no audit or test is removed.

## Application routes (v0.11.18-alpha)

Presentation-only History API routing with exact static rewrites. No database, session-format or draft migration. Keep root-relative entry assets for nested direct links. Verify both browser navigation and direct HTTP refresh. The existing API authorization and root-only analytics filter remain intact. A normal revert preserves data, but older versions return 404 for nested bookmarks; reopen /. See docs/navigation.md.

## Dark welcome (v0.11.19-alpha)

Presentation-only change; no database, session, report, draft or preference migration. The React Bits source is adapted into this website with its full MIT + Commons Clause notice. Keep that notice with a distributed build. A normal revert restores the previous welcome while preserving routing and saved data. Reduced motion or data-motion="off" on #welcome-hero disables the new effects; optional animation failure does not block login. Preview account configuration is unchanged.
