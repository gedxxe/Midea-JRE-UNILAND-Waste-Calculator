# Changelog

Release tags identify immutable milestones. Dates use Asia/Jakarta. Alpha versions are not stable releases.

## v0.9.1-alpha - 2026-09-28

- Deduct Piping Building 1# consumption from JRE Structural Laboratory usage before reports, worksheets and sub-meter totals. Preserve raw readings and saved history; flag missing inputs or negative net usage.

## v0.9.0-alpha - 2026-09-28

- Show combined reading periods as neutral notices, with inclusive dates and day counts in copied reports.
- Autosave one replaceable account draft for both factories, including incomplete entries, with local recovery, delayed synchronization and conflict handling.
- Save incomplete entries as a draft; keep revisions for completed reports. Add a separate working-draft table.

## v0.8.0-alpha - 2026-09-28

- Show every consumption-period label, including combined dates, with wider scrollable charts and matching exports.
- Add Auto/Manual Y-axis bounds per chart, with visible notes for clipped values.
- Add a weekend/combined-period picker with an explicit final-reading preview.

## v0.7.0-alpha - 2026-09-27

- Support private consumption-history imports in graphs, preserving period totals and existing saved reports.
- Identify the loaded page version and show a save-draft/reload notice when an update is available.

## v0.6.0-alpha - 2026-09-27

- Add configurable energy graphs with 9 JRE and 7 UNILAND workbook presets, bilingual titles and department names, and confirmed Window A/B legend aliases.
- Read each account’s latest saved report revisions through a private date-filtered endpoint. Preserve stored results, missing-data gaps, real zeros and full-period totals; exclude overlapping periods from plots with a visible notice.
- Add chart duplication, removal, variable selection, per-account browser layouts, white SVG export, 4000-pixel PNG export with 400 DPI metadata, and Copy graph for image paste. Keep units separate and normalize electrical MWh to kWh for graphs only.
- Add graph mapping, ownership/revision, export and desktop/mobile tests. No new dependencies or database migration.

## v0.5.0-alpha - 2026-09-25

- Add JRE raw gas entry for LPG, O2, N2 and R32 with reference-table kg conversion and per-observation R32 temperature from -20 to 50 °C.
- Calculate tank consumption with ordered refill events, validate source limits and inventory changes, and preserve explicit unavailable readings.
- Carry final gas readings and temperatures into the next day, preserve legacy manual utility data, and retain raw observations plus calibration metadata in historian snapshots.
- Add trilingual gas entry, reference provenance, source-node and interpolation tests, database round-trip checks, and desktop/mobile workflow coverage. No new dependencies or database migration.

## v0.4.0-alpha - 2026-09-25

- Add Export Raw Table Data with a preview and copy action for the active factory.
- Select start or end cumulative readings, defaulting to end; use the selected reading date and preserve raw decimal precision with ratio annotations.
- Export electricity meter rows only, including UNILAND Trafo readings. Follow the current 29-row JRE and 28-row UNILAND tables; exclude daily utility fields.
- Block incomplete or invalid selected columns while allowing explicit unavailable readings and an incomplete opposite column. Clear raw previews when closing or changing accounts.
- Keep consumption calculations, saved historian data, and official report templates unchanged.

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
