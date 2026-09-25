# Changelog

Release tags identify immutable milestones. Dates use Asia/Jakarta. Alpha versions are not stable releases.

## v0.3.1-alpha - 2026-09-25

- Show a compact login screen before opening the reading workspace, including during session checks and required initial password changes.
- Return to login after logout or an expired session; keep existing guest drafts separate.
- Add a retry action when the account service cannot be reached.
- Increase entry text size and use black table labels, equipment names, and readings. Preserve report output and calculation rules.

## v0.3.0-alpha - 2026-09-24

- Add username/password accounts with Argon2id, database sessions, required initial password change, account recovery, and shared rate limits.
- Add admin account creation, password reset, disable/enable, and session revocation.
- Add private per-user historian with server calculation, preserved output, append-only revisions, and concurrent-edit protection.
- Separate account drafts from existing guest drafts and clear active account state on logout or account changes.
- Add versioned PostgreSQL migrations, explicit bootstrap/recovery commands, server configuration, and trilingual account UI/docs.
- Extend Quality gate with a disposable PostgreSQL service, HTTP/database integration tests, and account browser flows.

Production requires separate database migration, credentials, admin bootstrap, and runtime verification. Builds never migrate the database. Browser runtime remains dependency-free; server packages are limited to PostgreSQL and Argon2.

## v0.2.0-alpha - 2026-09-22

- Add an English, Simplified Chinese, and Indonesian switch for the main interface. Keep equipment names and copied factory reports fixed.
- Show the package version, Git commit, build time, source hash, and local-change status in the footer and `build-info.json`.
- Add structured NTP refresh logs without meter data. Cached requests do not produce repeated refresh logs.
- Separate meter-table interaction, DOM helpers, translations, and build display from page coordination.
- Add trilingual README, agent requirements, release instructions, and this changelog.
- Add pinned development tooling, source and format checks, and browser regression tests for desktop and mobile.
- Add GitHub Actions Quality gate, a pull-request template, and Vercel build verification.
- Validate stored import-warning coordinates before restoring a draft.
- Add attribution: made in <3 by gede.

Calculation factors, report dates, equipment names, and localStorage draft version 4 are unchanged. Technical check notes use fixed English text and do not follow the interface language.

## v0.1.0-alpha - 2026-09-22

Baseline: `8e5bb21aa97344dff5d1c29826f71566b6f870f2`.

- Table entry for JRE and UNILAND, paired cumulative readings, fixed factory ratios, missing-data checks, text import, and Excel row export.
- Both factory reports use the first reading date. UNILAND Trafo readings are already MWh.
- Browser drafts, one-step undo, next-day entry, and asynchronous NTP through a Vercel Node.js Function.
- Unit and NTP transport tests with a static frontend and no runtime dependencies.

The package at this baseline previously said `2.0.0`. That label did not represent a tracked stable release; the preserved Git tag defines this alpha baseline without rewriting the old commit.
