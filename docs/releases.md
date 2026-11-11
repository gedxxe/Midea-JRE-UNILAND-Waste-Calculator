# Release and rollback

## Version policy

package.json is the version source; package-lock.json must match it. Use v0.MINOR.PATCH-alpha. Continue PATCH for the current alpha improvements. Patch numbers are integers: 0.9.9 is followed by 0.9.10, then 0.9.11. A future minor milestone requires a deliberate scope decision. Beta and stable 1.0.0 require explicit release decisions. Do not infer stability from successful tests.

- Work branch: codex/v0.MINOR.PATCH-alpha (matching package.json).
- Preserved baseline: release/v0.1.0-alpha and annotated tag v0.1.0-alpha, both at 8e5bb21aa97344dff5d1c29826f71566b6f870f2.
- Milestone branch: release/vX.Y.Z-alpha. Tag: vX.Y.Z-alpha. Create these only for the tested commit. Never move an existing milestone to a newer commit.
- main is the production source. Feature pushes create Vercel previews; merging main triggers production through the existing Git integration.

The versioned notes below record past changes. Use the current README and feature documentation for present behavior.

## Pull request and deployment

1. Start from the current main in a new codex/ branch. Check git status first and preserve other work.
2. Implement changes, update the version/lockfile/changelog, and update AGENTS.md if requirements changed.
3. Run npm ci, npm run verify, npm run test:integration against a test/development database, and npm run test:e2e. Install Chromium once with npx playwright install chromium.
4. Push the branch normally and open a PR. CI uses read-only permissions and official Actions pinned to commit hashes. Quality gate rejects high/critical dependency advisories with npm run security:audit and checks selected secret patterns, formatting, source contracts, unit tests, the build, and Chromium desktop/mobile behavior. Failure artifacts and build metadata are kept for seven days.

   PR commits run the full gate once through pull_request. Main pushes and manual dispatch also run the full gate; feature/release branch pushes do not create a duplicate check with the same required name. Every current job allows at least 60 minutes including setup and evidence uploads, as requested on 2026-11-04. The earlier 35-minute limit cancelled a push run after its 33.6-minute browser suite had passed. Keep one browser worker because clipboard tests share host clipboard access. Individual browser action/scenario deadlines still detect stalled behavior.

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

## Welcome and sign-in refinement (v0.11.20-alpha)

Presentation-only change. No database, session, reading, report or preference migration. Strict per-letter hover replaces the autonomous sweep; bounded ASCII replaces the old particle/logo login decoration. Keep the full React Bits notice with builds. WebGL/module failure leaves static HTML/CSS and usable sign-in; authentication never waits for an animation. A normal revert restores v0.11.19 presentation without rewriting saved data. Preserve earlier release branches/tags and keep preview authentication unconfigured.

## Welcome motion correction (v0.11.21-alpha)

Presentation-only fix, with no schema, database, session or preference migration. A normal revert restores the v0.11.20 presentation without changing saved data. Keep React Bits notices and existing immutable milestones. Preview account setup stays unchanged. Publish only one intended feature PR; create the release branch/tag at the final tested commit, after any test fixes, so a checkpoint PR cannot accidentally omit them.

## Supplied TechText and glass (v0.11.22-alpha)

Presentation-only revision with no database, session, draft, account or analytics migration. The supplied TechText engine supersedes the earlier compositor-only lift; GlassSurface is optional and falls back to CSS. Retain the full upstream notice with distributed builds. A normal revert PR restores v0.11.21 presentation without modifying saved data. Preserve earlier tags and release branches. Preview login remains unconfigured.

## Autosave destination protection (v0.11.36-alpha, in development)

No SQL migration. New code adds owner-scoped period reads and checks the observed version before replacing an archived document. Old clients may receive a conflict when revisiting stored periods and should reload. Rollback removes these code-level protections; preserve a private workspace/period/checkpoint backup and do not treat a Git rollback as data recovery. Production incident recovery remains a separate reviewed operation.

The immutable release/v0.11.35-alpha branch is a failed candidate, not a published release. Its full browser gate exposed obsolete checkpoint assertions and synthetic input during period loading. Keep that branch unchanged; the corrected candidate uses v0.11.36-alpha and must pass the complete gate before tagging.

## Night Shift appearance (v0.11.37-alpha)

Presentation only. No migration or persisted theme preference. A normal revert PR restores the light-only panel while preserving readings, the v0.11.36 autosave protections and historical output. Circular view transitions have immediate fallbacks; reset cancels old account snapshots. Chart exports and print colors remain unchanged. No production data writes or new environment configuration are needed.

The optional circular reveal uses [native document view transitions](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) for palette changes only. Mode rendering and persistence stay synchronous with the existing controllers.

## Neutral Night palette (v0.11.38-alpha)

Scoped CSS retouch and contrast regressions only. A normal revert restores the previous Night palette while retaining the circular transition and autosave protections. No migration, stored-data changes or environment configuration. Light mode, welcome/login, white chart exports and print output stay unchanged.

## JRE direct R32 stock (v0.11.41-alpha)

Migration 008_r32_kg.sql adds format-preservation triggers to the existing workspace, period-autosave and checkpoint tables. It rewrites no readings or historical output. The new JRE gas input marker carries per-observation kg units; populated legacy points remain mm, with their original temperature conversion. UNILAND does not adopt this marker.

Before production: pass all checks, including the isolated PostgreSQL stale-writer/rollback tests; refresh the private recoverable backup; obtain explicit approval; then apply migration 008 with the maintenance connection and verify its checksum before merging/deploying this release. Do not run it during a build or use the runtime connection for maintenance.

Migration 008 was explicitly approved and applied on 2026-11-03. A fresh private encrypted application-data archive passed read-back verification and restoration into temporary tables in the separate development environment. All application tables were compared unchanged within the production migration transaction; three triggers, the migration checksum and restricted runtime reads were verified. This is not a full Neon project disaster-recovery test. The code release still requires the final PR gate.

Keep migration 008 during code rollback. Old code must fail rather than remove the marker or reinterpret kg as mm. Resume editing with a compatible version; never strip units, downgrade the format marker or drop the triggers to make an old writer work. Legacy report output remains immutable. Check before/after raw readings and checkpoints in the approved environment, including all three modes and pending recovery queues.

## Complete raw copy (v0.11.39-alpha)

Read-only sharing formatter and UI scope selection. No migration or stored-format changes. A normal revert restores the previous electricity-only copy control; recordings and autosave are unaffected. The complete sharing text is not an import file: Electricity only retains the existing import contract. Public blank electricity templates stay unchanged.

## Rendering and export refactor (v0.11.42-alpha)

Reuse existing DOM helpers and per-call export/date lookups without changing the schema, persistence, API, dependency set or calculation rules. No migration or production data write is needed. Preserve legacy layout/unit readers and original saved output. A normal revert PR restores v0.11.41 behavior while keeping migration 008 and all stored observations intact. Local synthetic comparisons and targeted browser checks complement the full required Quality gate; do not merge while it is pending or failing.

## Pending browser recovery (v0.11.43-alpha)

No SQL migration or API/format adoption. Pending localStorage recovery uses owner/writer-specific keys while retaining the existing tab copy, workspace and period API. A compatible client can read pending copies after tab closure or account reauthentication. A rollback to v0.11.42 leaves these keys intact but cannot recover them through that older UI; keep the browser data and return to compatible code. Do not clear recovery as a rollback step. Original stored reports, raw strings, units, queued-period versions and migration guards remain unchanged.

The pre-edit production recovery archive was specifically approved for encrypted local storage and verified by local read-back/hashes. That permission did not authorize transferring production data to development. Browser and database regressions use synthetic data. No production repair or deployment is part of the local test evidence; the earlier missing-reading incident is not proven recovered.

## JRE Air Compressor flow (v0.11.54-alpha)

JRE layout 8 adds cumulative air flow without changing electrical meter identities. Restore layout 7 and older copies into an editable layout 8 copy, retaining every original reading and adding only blank fields. The first applicable period starts at 12 November 2026, 08:00 WIB. Stored historical output stays unchanged.

Before production merge, explicitly apply migration 012_jre_air_flow.sql with the maintenance connection after a fresh encrypted backup and read-back verification, final checks, and specific production approval. It adds preservation functions/triggers for working copies, archived period autosaves and historical checkpoints; no data is rewritten. The runtime still uses existing JSON storage and grants. Builds never migrate.

A revert must retain migration 012 and the recorded data. Old writers are rejected rather than allowed to drop flow readings; return to compatible code to edit protected records. Do not delete a workspace, browser recovery or observations as a rollback step. The earlier missing-reading incident is not established as recovered by these tests.
