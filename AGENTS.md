# Working on this repository

## Purpose and current state

Build a lightweight daily energy reporting website for Midea JRE and UNILAND. Operators enter cumulative readings in a table, review consumption, and copy factory reports or Excel worksheet rows. This is an alpha reporting tool, not a control system or certified industrial product.

Current milestone: v0.9.0-alpha in package.json. Preserved baseline: v0.1.0-alpha at 8e5bb21aa97344dff5d1c29826f71566b6f870f2. The old package value 2.0.0 was not a tracked stable release. Read CHANGELOG.md and git status before editing; do not assume work in progress is disposable.

## User decisions, last confirmed 2026-09-25

- Build a convenient table filler with copy-ready reports. Text import is optional, not the main flow.
- Both report titles use the START reading date. 16 September 08:00 to 17 September 08:00 means a 16 September report for both plants.
- UNILAND Trafo 1, 2, and 3 cumulative values are already MWh.
- README.md must contain English first, Mandarin Chinese second, Indonesian third.
- A website language switch is wanted. Not every element needs translation. Main interface text follows the selection; equipment, units, and copied report templates retain their official wording. English is the default. Do not print three languages beside every field.
- Include the literal attribution `made in <3 by gede`.
- Keep wording ordinary and concise. Avoid em dashes, exaggerated quality claims, and generic AI wording.
- Use real asynchronous NTP, with explicit failure states. A device clock is not evidence of NTP sync.
- Remain deployable on Vercel and avoid unnecessary dependencies or services.
- Maintain modular code, tests, CI/CD, incremental version numbers, and rollback points. Never force push.

- Show a login screen first. Keep the reporting workspace hidden until a session is established and any required initial password change is complete. Logout returns to login. Preserve old guest drafts separately without exposing a guest entry mode.
- Use larger entry text and black equipment labels/readings for readability, including on mobile.
- Export raw cumulative electricity readings as a copy-ready factory/date/numbered list, with ratio annotations only and no consumption calculations or daily utilities. Choose start/end column; default to end and use that column’s date. The user confirmed UNILAND export follows the current 28-row website table, not the different 26-row example. Do not fabricate component meters or omit Trafo readings.
- JRE gas rework uses raw LPG %, Oxygen mmWC, Nitrogen mmH2O and R32 mm plus temperature at every observation. R32 supports -20 to 50 °C, including decimals, using the supplied workbook tables. Convert each Before Work, Before/After Refill and After Work observation to kg first, then calculate stock usage with refill correction. After Work normally uses next morning's reading. Preserve manual legacy utilities and store raw gas history. UNILAND is out of scope for this rework.
- Add individual username/password accounts without Google SSO and save reports per account in Neon PostgreSQL.
- Keep the existing static frontend and Vercel Node APIs. No framework migration is required.
- User chose power-engineer for the first admin username. Generate temporary credentials locally; require a password change at first login.
- Separate development and production database connections. Do not store or print credentials in agent memory.
- Admins manage accounts; reports remain private to their owner. Correcting a report creates a revision.

- Graph decisions confirmed 2026-09-27: graphs synchronize from saved energy records; default department splits follow the reference workbook (9 JRE, 7 UNILAND). Branch 1 is JRE, Branch 2 is UNILAND. White background, thin lines, bold Arial/Helvetica titles, English/Chinese titles and department names. Operators can choose variables and split charts. User explicitly chose Excel legend aliases Window A = Window and Window B = Dehumidifier, for graphs only. Also provide Copy graph as a high-resolution clipboard image alongside SVG/PNG downloads; date ranges adapt automatically and data tables expand/collapse.

- User requested importing September 2026 JRE and UNILAND consumption from the reference workbook into their confirmed production account. April–August and monthly summaries are excluded. Preserve existing saved reports; skip empty template rows; keep combined dates as full periods. Imported consumption is graph history, not cumulative meter readings or editable factory reports. Never invent a starting meter value from consumption.

New user instructions override older choices here. Update this decision record, README, and changelog when requirements change. Record what was actually decided, not inferred preferences or invented chat memory. Do not store credentials or operational readings in documentation.

- Graph refinement confirmed 2026-09-27: every plotted period must have a visible date label, with combined consumption dates kept as one point (18–20 ends at the 21st reading). Provide a combined-period entry helper. Y-axis bounds may adjust the view only; automatic zero-based scaling is the default. Keep changelogs about product changes, not operational import jobs. Imported data is database content, never hardcoded or committed; deleting it requires an explicit batch-specific maintenance request.

- On 2026-09-28 the user confirmed one active replaceable draft per account containing JRE and UNILAND. Incomplete entries must autosave; Save routes incomplete data to draft storage and complete data to the existing report workflow. Autosave must not create report revisions or write on every keystroke. Detect cross-tab/device conflicts instead of silently overwriting them.

## Architecture

- schema.js owns equipment names, meter counts, fixed factors, report units, and utility labels.
- engine.js, numbers.js, and worksheet.js are pure business logic. They must not import DOM, language state, storage, or network modules.
- gas.js owns pure JRE interpolation, event validation and consumption; gas-tables.js contains mass calibration data only. ui/gas.js renders entry; i18n/gas.js owns translations. Read docs/gas.md before changes. Never commit source operational workbooks or readings.
- server/history-import.js validates owner-scoped maintenance imports and requires a reviewed plan hash before atomic writes. Migration 002 stores immutable import provenance and consumption separately from meter reports. Runtime reads imports only; saved reports supersede imported overlapping periods. Source data stays outside Git and public assets.
- graph-axis.js owns consumption-period labels and validated Y-axis domains; ui/period.js translates inclusive consumption dates into existing reading endpoints. graph-schema.js owns workbook chart groups and aliases. graph-data.js extracts immutable saved output, preserves null gaps and detects overlapping periods. server/graphs.js reads only the session owner’s latest report revisions. ui/graphs.js owns per-account browser layout settings and clears fetched data on identity changes; ui/graph-renderer.js owns SVG/PNG rendering. Read docs/graphs.md before graph changes. Never recalculate old historian values with the current engine or invent readings for missing dates.
- raw-export.js validates and formats one raw reading column independently of calculated reports. ui/raw-export.js owns its preview/copy dialog and clears it on account changes.
- importer.js parses and validates a complete input before applying it. Never partially apply a failed paste.
- server/drafts.js owns a separate owner-scoped working_drafts row with an optimistic concurrency token, not revision history. ui/drafts.js owns immediate sessionStorage recovery, 30-second idle/120-second continuous-edit sync, bounded retry and explicit conflict choices. Account changes clear local data and invalidate in-flight work. Migration 003 is explicit, never a build step.
- storage.js validates version-4 drafts. Preserve existing drafts across UI/language releases.
- app.js coordinates events and state. ui/table.js owns table rendering and navigation; ui/dom.js provides DOM helpers; ui/build-info.js displays release metadata.
- i18n/catalog.js contains English, Simplified Chinese, and Indonesian UI strings. Render translated/user text with textContent or value, never innerHTML.
- clock.js owns the browser clock. api/time.js and server/ntp.js provide NTP. server/log.js logs only an allowlist of service metadata.
- scripts/assets.mjs is the public-file allowlist shared by build and local server. New browser modules must be listed. Do not expose docs, tests, scripts, or server code as static assets.
- package.json is the only version source. Keep package-lock.json and CHANGELOG.md consistent. Build metadata is generated into dist and never committed.

Keep the browser runtime dependency-free. Development dependencies require a concrete benefit and exact versions. Do not add a framework, database, telemetry SDK, or AI features without a user need.

## Accounts and database

- server/password.js owns Argon2id and credential validation. server/auth.js owns sessions, account consistency, rate limits, and audit writes. server/http.js owns origin/body/error handling.
- server/reports.js checks ownership and expected revision for every mutation. server/report-data.js reuses the pure engine and stores raw readings plus original English output and engine version.
- PostgreSQL SQL is parameterized; identifiers are fixed. All report/revision/audit changes share a transaction. Never trust client user IDs, reported totals, factors, or units.
- ui/accounts.js coordinates account/historian UI. app.js scopes signed-in drafts to sessionStorage per user and keeps old guest localStorage separate. Account changes clear readings, undo, dialogs, and temporary passwords.
- API and CLI code must not print connection strings, raw database errors, request bodies, session cookies, passwords, or readings.
- Read docs/accounts.md before database setup or recovery. Migrations and admin bootstrap are explicit commands, never build steps. Use a privileged migration connection separately from a restricted runtime role.
- Integration tests require TEST_DATABASE_URL and may create/clean only their own synthetic data in development/test. Never run them against production.

## Calculation rules to preserve

Read docs/meter-rules.md and tests/engine.test.mjs before changing calculations.

- JRE: 29 equipment rows, 57 meters. Main Total is a direct delta; never multiply it by 1000 or replace it with the sub-meter sum. Office is x1000; Utility Area is x1000 and x40. Piping All is Piping Building 1# plus Piping Building 3# for the worksheet only.
- JRE inactive-to-zero exceptions apply only to Air Compressor 1# and New Air Compressor 2# after operator confirmation. Next day resets this confirmation.
- UNILAND: 28 rows. Main factor 3.2 MWh; Trafo rows direct MWh; Building A/hydrant .16 MWh; Building B .08 MWh; pump/power house .02 MWh; refrigerant area x40 kWh; other rows direct kWh. Keep exact template spelling, numbering, spaces, and Mwh/KWh capitalization.
- Missing data is never silently zero. Empty/invalid values block copying; explicit unavailable or decreasing readings become `-` with check notes. One missing meter invalidates the whole equipment result. Never show a partial JRE sub-meter sum as complete.
- Decimal comma or dot, no thousands separators/exponents/suffixes. Maximum six decimals and cumulative 1000000000000. Preserve BigInt scaled subtraction.
- JRE nonzero output has two decimals; zero is 0. UNILAND trims up to eight decimals without exponential notation.
- Both reports use start date. Combined reports require matching BOTH endpoints. Combined periods show a neutral notice, inclusive consumption-date range and number of days. Daily report wording stays unchanged.
- JRE worksheet has date plus 18 values; UNILAND has 16 values without a date. UNILAND grouped areas are worksheet-only.

## Verification and release work

Use Node 22.x. Run npm ci, npm run verify, npm run test:integration with a test/development TEST_DATABASE_URL, then npm run test:e2e after installing Chromium with npx playwright install chromium. CI additionally installs browser OS dependencies. Browser tests use a dedicated local server and mocked time responses; they do not prove public NTP availability. For deployment work, separately inspect /api/time and build-info.json on the deployed URL.

Use npm run format for formatting. Add tests for changed business behavior and data-loss risks, not tests that merely repeat an implementation. Exercise language switching with a filled draft and confirm report bytes stay unchanged. Check desktop/mobile rendering and console errors when changing UI.

Branch: codex/vX.Y.Z-alpha. Open a PR to main and require Quality gate. Read docs/releases.md before GitHub mutations. Do not merge a PR, deploy production manually, rewrite main, replace tags, or delete release branches without the user's applicable authorization. Existing authorization to push covers a normal branch push and PR; it does not mean force push. Preserve rollback history. Attach created PRs to the current task.

Do not claim branch protection, CI success, or deployment success without reading the actual GitHub/Vercel result. Configuration files alone are not proof. If an external permission or platform setting prevents a control from being applied, report that specific limitation.
