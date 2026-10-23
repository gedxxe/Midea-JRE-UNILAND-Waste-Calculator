# Changelog

Release tags identify immutable milestones. Dates use Asia/Jakarta. Alpha versions are not stable releases.

## v0.11.18-alpha - 2026-10-23

- Add lightweight presentation routes for reading entry, monitoring, report history and admin accounts. Keep the existing views, with Back/Forward, direct links, refresh and localized browser titles.
- Resolve sessions before opening protected views; preserve draft state during same-document navigation and return signed-out or password-gated users to login. Keep server authorization and immutable reports unchanged.
- Use fixed Vercel/local-server rewrites and root-relative assets for nested paths. Unknown paths and private files remain unavailable. No browser dependency, database migration or additional analytics collection.

## v0.11.17-alpha - 2026-10-22

- Retouch the signed-out welcome screen with large type, more space, concise localized copy, a refined sign-in form and short entrance transitions. Add the requested rendered-heart credit for gedxxe and the Midea JRE Engineering Department.
- Add an optional blue particle field around the original Midea logo. Keep its reconstruction loop and five-second hold, pause/replay, reduced-motion and motion-off support. Stop rendering in hidden tabs, outside the viewport and after sign-in; cap drawing at 30 fps and canvas resolution at 1.5 device pixels.
- Keep authentication and reporting unchanged. Load decoration separately so a failed canvas/module cannot block sign-in. Retain all CI checks with a 25-minute budget for browser setup plus the full suite.

## v0.11.16-alpha - 2026-10-22

- Fix the monthly table shrinking to one row on short screens. Keep a readable table viewport and let scrolling continue into the parent dialog at table boundaries.
- Add full-window viewing for charts and tables, initially collapsed table filters, a visible recording-mode label and Escape-to-restore. Reset window state on close/account changes; keep frozen headers, saved values and exports unchanged.
- Add actual wheel-scroll and short desktop/mobile viewport regressions. Allow 20 minutes for the unchanged CI checks because browser OS dependency installation can exceed the old job budget.

## v0.11.15-alpha - 2026-10-22

- Add a localized monthly consumption matrix for JRE and UNILAND, with month/year headings, full date headers, frozen equipment names, department/search filters and one cell for each combined period. Keep missing values distinct from zero and preserve full totals across month boundaries.
- Refresh the monitoring surfaces and add bounded smooth chart paths, shared pointer/touch/keyboard tooltips, crosshairs and temporary legend visibility. Preserve saved values, gaps, static high-resolution exports and reduced motion.
- Reuse the existing owner-scoped graph endpoint without database, account, calculation or dependency changes.

## v0.11.14-alpha - 2026-10-22

- Simplify graph viewing with concise titles, a department filter, one-click image copy and a PNG/SVG download menu. Keep workbook groupings, all period labels, raw data gaps and optional scale controls.
- Show chart titles, legends, tooltips, table labels and exports in the selected English, Mandarin or Indonesian interface language. Retain JRE/UNILAND names, production terms and canonical saved outputs.
- Preserve custom titles, variables and axes while reading legacy browser layouts; save new edits under a separate v2 key. Cancel delayed exports when their chart changes. Add a brief entrance animation with reduced-motion and motion-off support; exported images remain static. No account, API or database change.

## v0.11.13-alpha - 2026-10-22

- Add JRE Charging Forklift Building 2 as a direct kWh Start/End pair in all three periods. Subtract its consumption from Electricity Building 2# alongside existing deductions, retaining the separate Forklift row and graph series without double counting.
- Upgrade old JRE drafts to layout 5 with the new pair blank; preserve exact-date/time observations during older text imports. Keep raw exports/templates current, reject stale layout saves and retain saved historical output and worksheet columns. No SQL migration or new dependency.

## v0.11.12-alpha - 2026-10-22

- Record gas, Water and existing manual utilities separately in 24 HOURS, AFTER PRODUCTION and NIGHT SHIFT for both factories. Display actual period timestamps, apply the existing tank/refill engine and water subtraction, and include entered values in each selected report section and saved graph period.
- Share matching gas observations with R32 temperatures and cumulative Water readings by factory/date/time. Preserve manual totals, tank selections and untimed refill lists per period; detect conflicting observations and inconsistent refill lists in bundled reports. Date changes and next day retain matching observations and support Undo.
- Add shift utility format markers and backup v4, reading older backups without inventing shift consumption. Migration 006 protects newer drafts and report revisions from older writers during code rollback. Apply it explicitly before production merge; builds never migrate or rewrite history.

## v0.11.11-alpha - 2026-10-21

- Set JRE Structural Laboratory net consumption to 0 when valid Piping Building 1# meter 1 usage after x40 exceeds its gross usage. Keep positive differences and apply the rule in all three electricity periods, worksheets, sub-meter/gap totals and new saved graphs.
- Explain the zero rule in the table and show max(0, gross minus included usage) in the calculation detail. Preserve raw counters, missing/invalid checks, other equipment deductions and historical output. No layout or database migration.

## v0.11.10-alpha - 2026-10-21

- Also exclude the direct kWh consumption of Nitrogen and Refrigerant Station from JRE Electricity Building 2# in every electricity period, while retaining the Station as a separate equipment row.
- Update the table explanation, sub-meter/gap totals and newly saved graph values. Preserve original cumulative readings, daily gas calculations and historical output; no layout or database migration.

## v0.11.9-alpha - 2026-10-20

- Read graph utility values from the report body, excluding check notes that can repeat a gas label after an unusual stock movement.
- Preserve numeric consumption when a stock notice is present, keep +stock increases out of consumption series, and continue rejecting genuine duplicate measurement lines.

## v0.11.8-alpha - 2026-10-20

- Keep calculated LPG, Oxygen, Nitrogen and R32 stock increases visible for both plants, with a + amount and measured-stock-increase label instead of blocking completed reports.
- Warn about increases outside recorded refills while keeping the signed balance and raw observations in new snapshots. Keep invalid inputs and decreasing refill events blocked.
- Keep stock gains out of consumption graph series, preserve ordinary consumption formatting and immutable history, and add browser/API regressions for save, copy and language changes.

## v0.11.7-alpha - 2026-10-20

- Report JRE Electricity Building 2# net of all Heat Exchanger meters, Outdoor meter 2, Window meters 4 and 5, and Indoor meter 2, with each configured ratio applied before subtraction.
- Apply the correction to all electricity periods, sub-meter sums, gaps and newly saved graph output. Preserve cumulative readings, raw templates/exports, worksheet columns and historical reports.
- Keep missing dependencies and negative net usage unavailable with check notes; do not invent zeros or deduct unrelated components.

## v0.11.6-alpha - 2026-10-19

- Add an optional eight-step Quick guide with animated cursor illustrations, Back/Next, pause and reduced-motion support.
- Offer a small dismissible invitation once per account/browser, with a permanent guide button after sign-in. Load the illustrations, translations and styles only when opened.
- Keep guide actions separate from readings, autosave, report history and database requests; close and invalidate pending opens on account changes.

## v0.11.5-alpha - 2026-10-17

- Change JRE Window meter 6 (Vacuum Box) to x40 and add direct Piping Building 1# meter 3.
- Subtract converted Window meter 6 usage from Piping meter 3 before summing Piping. Show its net usage directly; keep Structural dependent only on Piping meter 1.
- Upgrade old JRE drafts with the new slot blank, support complete older raw imports without inventing readings, and reject stale layout saves. Preserve saved report output, graph identities and worksheet columns.

## v0.11.4-alpha - 2026-10-17

- Recover identical account drafts after a lost save response even when JSON object keys are returned in a different order; keep real concurrent-edit conflicts.
- Prevent delayed clipboard callbacks from restoring a stale report preview after edits or an account change.
- Store tab recovery and save metadata atomically; preserve legacy pending readings and require explicit resolution when the server copy changed.
- Enforce the cumulative reading maximum exactly, including fractions that floating-point rounding previously accepted above the limit.

## v0.11.3-alpha - 2026-10-16

- Limit authenticated content reads across serverless handlers with independent graph and editing budgets; retain draft-save availability when reads are throttled.
- Remove the footer blank-template duplicate while keeping contextual export and sign-in access.
- Reorganize trilingual README with workflow/architecture visuals, documented operating limits and rights-reserved licensing. Correct analytics/draft privacy disclosure and record the security review scope and unresolved readiness checks.

## v0.11.2-alpha - 2026-10-16

- Add JRE Vacuum Box x40 under Dehumidifier and direct Area Repair Injection Molding; change Piping Building 3# to x40 in all electricity periods.
- Report Electricity Building 3# net of the two included converted meter usages, preserving gross readings and main Total.
- Upgrade existing drafts with blank new fields, preserve omitted readings on matching-time legacy imports, and reject stale layout saves. Keep historical output, graph identities and worksheet columns unchanged.

## v0.11.1-alpha - 2026-10-16

- Add five final report choices covering 24 HOURS, AFTER PRODUCTION and NIGHT SHIFT for both factories; retain independent raw-reading export.
- Reuse exact matching morning/evening/next-morning observations across recording modes. Preserve conflicting legacy values and share only cells explicitly corrected by the operator.
- Keep gas and Water once under the daily section, unchanged worksheet/save scope, stable report identities and immutable historical output.

## v0.11.0-alpha - 2026-10-15

- Add Day and Night electricity reports for JRE and UNILAND, with exact date/time sharing of evening readings and next-morning carry into the following Day.
- Provide Copy Day, Copy Night and Copy Day + Night. Keep gas and Water daily and retain historical report output.
- Extend private drafts, backup/Undo, historian and graphs to Night; reject conflicting restored shared readings and protect shift drafts during code rollback.
- Add explicit migration 005 for separate daily/shift report identities. Remain alpha.

## v0.10.2-alpha - 2026-10-15

- Add UNILAND SV window, Painting and Dryer as individual direct kWh meters in daily and working-hours entry, reports, raw templates/exports and graph choices.
- Upgrade existing drafts without shifting old readings or filling new meters; retain historical graph identities and reject stale draft writers.
- Align Next day guidance with the active reading mode.
- Accept optional Pagi/Sore date labels. Untimed work imports use the selected column time; explicit Reading time lines remain supported.

## v0.10.1-alpha - 2026-10-15

- Add production-only Vercel Web Analytics for aggregate visits without a browser package or database changes.
- Filter page views to the root URL, omit query strings and fragments, reject custom events and keep preview/local runs out of statistics.
- Keep reporting usable when the tracker is blocked and provide build and HTML switches to disable it.

## v0.10.0-alpha - 2026-10-14

- Add a separate morning-to-after-work electricity workflow for both factories, defaulting to 08:00–17:00 with editable reading times.
- Preserve independent daily and working-hours drafts, report revisions and graphs; time-aware raw import/export, backup and Undo retain observations without relabelling them.
- Keep daily gas, Water and historical outputs unchanged; working-hours Next day starts empty instead of carrying evening readings into the next morning.
- Add an explicit, backward-compatible database migration for report kinds. Remain alpha during the one-week trial.

## v0.9.19-alpha - 2026-10-13

- Accept UNILAND three-meter Building, hydrant, pump, power house and Heat Exchanger readings; apply each configured factor before summing.
- Keep the repeated 10HP lab observations as distinct inputs, and allow import without Trafo rows while preserving matching-date readings and incomplete drafts.
- Upgrade existing drafts without invented component values and preserve historical graph identities.

## v0.9.18-alpha - 2026-10-13

- Distinguish tab recovery from account saves and show database-confirmed save times; correct autosave privacy wording.
- Add private account-bound draft backup and validated restore for both plants, including incomplete entries, with workspace Undo and no report revision links.
- Let gas, R32 temperature, refill, Water and manual-utility check notes focus the related input.

## v0.9.17-alpha - 2026-10-09

- Add cumulative Water readings to UNILAND and move remaining manual utilities into gas, removing Daily utilities. Preserve older consumption-only values.
- Add separate UNILAND Piping and New Office Building A rows with safe draft upgrades, updated raw templates and reports, and stable historical graph identities.
- Include both HE and Piping in the existing worksheet group for new reports.

## v0.9.16-alpha - 2026-10-09

- Add UNILAND raw gas readings, per-observation R32 temperature and refill correction using its workbook calibration tables and the JRE entry workflow.
- Preserve manual gas values and original units, save incomplete raw drafts, and separate new kilogram graph series from older utility history.

## v0.9.15-alpha - 2026-10-08

- Loop the login logo through reconstruction, a five-second hold and an exit, with pause/resume, hidden-tab suspension and reduced-motion support.
- Expand API injection, stored-text/SVG safety, cookie, cross-instance login throttling and static-path regression tests.

## v0.9.14-alpha - 2026-10-08

- Run deployment secret checks against the explicit runtime file list without requiring Git metadata, which Vercel removes before building. Keep the full workspace scan in CI.

## v0.9.13-alpha - 2026-10-08

- Fetch only saved report/worksheet text for graphs, preserving historical results while reducing database response data.
- Add a local secret guard, CI dependency audit, weekly dependency update PRs, and API boundary regression coverage.

## v0.9.12-alpha - 2026-10-07

- Correct T1–T4 to JRE only. Keep unnumbered consumption notes out of raw exports and totals, and preserve legacy UNILAND reading data without reassigning it.

## v0.9.11-alpha - 2026-10-07

- Add optional UNILAND T1–T4 cumulative kWh readings as unnumbered consumption notes. Preserve them in drafts and dated periods without changing totals, worksheets or raw exports.

## v0.9.10-alpha - 2026-10-07

- Add blank JRE and UNILAND electricity reading templates with copy and .txt download, available before login or data entry. Keep every current meter and ratio without including entered readings.

## v0.9.9-alpha - 2026-10-07

- Add a pre-login Midea logo reconstruction with optional replay, reduced-motion fallback and a static-logo switch. Keep sign-in available during playback in development and production.

## v0.9.8-alpha - 2026-10-06

- Align Start and End reading inputs in JRE and UNILAND while keeping individual usage below End. Keep meter labels aligned at the top of each row.

## v0.9.7-alpha - 2026-10-06

- Move two JRE Warehouse meters into Window and Piping 1, with legacy draft/text compatibility. Structural deducts only the original Piping 1 x40 meter.
- Show individual meter usage beside readings while keeping equipment totals separate.
- Add JRE cumulative water readings in m³ below gas, move manual gas values into their gas cards, and preserve historical consumption-only water entries.

## v0.9.6-alpha - 2026-10-05

- Move meter and gas observations with their dates when changing periods; show dates on reading columns and keep Undo recovery. Clear period-specific utilities and refills for a new period.
- Populate Import text from the selected Start/End column and keep unapplied text separate while switching.

## v0.9.5-alpha - 2026-10-04

- Show an explicit + for positive gaps in the results panel and copied reports, including percentages. Keep negative signs and display rounded zero without a sign.

## v0.9.4-alpha - 2026-10-03

- Calculate the JRE cross-check gap as sub-meter total minus main meter, with the same sign in its percentage and copied report. Label the direction in the results panel.

## v0.9.3-alpha - 2026-10-03

- Recheck saved import ratio warnings against current meter factors, removing obsolete warnings when reopening drafts or calculating new reports. Equal compressor readings correctly remain zero consumption.

## v0.9.2-alpha - 2026-10-03

- Correct JRE Air Compressor 1# to use ratio 40 in consumption and raw-export annotations. Keep the inactive exception and stored history unchanged.

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
