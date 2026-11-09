# Changelog

Release tags identify immutable milestones. Dates use Asia/Jakarta. Alpha versions are not stable releases.

## v0.11.53-alpha - 2026-11-09

- Align new-device profile suggestions with the firmware's selectable profiles. Replace the legacy Schneider Delivered-only suggestion with the active PM5110 D+R profile.
- Document exact Modbus-profile/uplink-binding matching and safe source re-registration. Preserve existing device bindings and historical readings; no migration or firmware change.

## v0.11.52-alpha - 2026-11-07

- Let signed-in operators view admin-registered meters, latest kWh/current and connection status across JRE and UNILAND. Exclude removed cards and inactive admin owners; keep personal legacy sources and operator reports private.
- Keep card changes, provisioning downloads and physical Read now requests with the owning admin. Operators can refresh stored readings and use view auto-sync only. No migration, credential transfer or stored-reading change.

## v0.11.51-alpha - 2026-11-07

- Update an open IoT card form when database/grant readiness changes. Keep typed names and firmware IDs intact while enabling or disabling the appropriate fields.
- Cover the transition with real keyboard entry on desktop/mobile. No migration, dependency or operator-reading change.

## v0.11.50-alpha - 2026-11-07

- Add JRE Outdoor meter 3 x40 and deduct its consumption once from Window. Use 6 November 2026 at 17:00 WIB as the first baseline; periods starting earlier retain their previous calculation.
- Preserve old reading strings when upgrading editable copies to layout 7. Accept previous two-meter Outdoor imports and retain same-time observations. An unavailable new meter contributes zero with a notice, without fabricating a raw reading; invalid or decreasing values still require review.
- Protect archived period autosaves against older-layout writers. Keep historical report output unchanged; no database migration or automatic data repair.
- Suggest the firmware's `schneider-pm5100` profile while retaining custom profile registration and private configuration export. No firmware implementation or dependency is added.
- Add owner-scoped admin card naming, reversible removal and restore. Keep device bindings and reading history intact; restored cards require a replacement key before uploads resume. Stage additive migration 011 with metadata-only grants and old-schema compatibility.
- Allow connection JSON to be downloaded again without exposing a device key. Keep the private firmware header available only with its one-time key, and explain when hiding the page has cleared it.
- Fix the browser gate's outdated meter-input count by deriving it from the schema and checking the newly added legacy slots remain blank. Review the static budget at 1,185,000 bytes for card controls and translations; no browser dependency is added.

## v0.11.49-alpha - 2026-11-06

- Add on-demand meter readings with a server-enforced ten-second cooldown, one pending request per source and a two-minute request lifetime. Deliver the request through authenticated heartbeat acknowledgments; cached or future captures do not confirm completion.
- Use ten-minute reading-view sync and lightweight presence checks. Show a compact animated waiting/cooldown rim with reduced-motion support, and round monitoring values to at most three decimals without changing stored precision.
- Stage feature-gated migration 010, retain old-schema compatibility with the flag off, and include the new API in local routing and build checks. No operator autosave/report mapping or production activation is implied.
- Bound static assets to 1,175,000 bytes for the command controls, lightweight status handling and translations; no browser dependency is added.

## v0.11.48-alpha - 2026-11-05

- Show Connected, Offline, Unverified and Disabled per device, independently of meter readings. Use authenticated server contact and expire stale badges after three minutes, including when automatic refresh is off.
- Accept a bounded heartbeat through the existing device endpoint without inventing measurements or adding observation rows. Refresh contact on identical accepted reading retries; retain event deduplication, owner isolation and upload budgets.
- Document the firmware heartbeat handoff and distinguish a reachable HTTPS route from verified device contact. No new dependency, migration or operator-data mapping.

## v0.11.47-alpha - 2026-11-05

- Add a private node configuration download matching the existing ESP32-S3 uploader macros and supported meter profile IDs. Use the server-configured stable HTTPS origin instead of the browser's localhost or temporary preview URL.
- Block website registration when HTTPS provisioning is missing. Keep custom source identities, one-time keys, owner checks and existing kWh-only wire compatibility.
- Document direct node Wi-Fi uplink, exact ACK/retry semantics, remaining current telemetry changes and physical commissioning checks. Diagnostics remain separate from operator reports and autosave. No dependency or migration change.

## v0.11.46-alpha - 2026-11-05

- Let admins register diagnostic power meters with configurable factory, device, meter and firmware profile IDs, generate one-time keys, replace keys and disable uploads without deleting observations.
- Show each source's latest captured kWh and optional current in A, with explicit phase labels. Keep older kWh-only uploads compatible; a busy source cannot hide another source's latest card reading.
- Keep LoRa diagnostics separate from operator readings, autosave, consumption charts and reports. No automatic filling, conversion or report mapping is provided.
- Clear one-time keys on close, account change or hidden pages. Retain owner/admin/origin checks, upload limits and explicit pending/error states. No new dependency or database migration; runtime device-management grants require explicit setup before enabling the feature.
- Allow 1,160,000 static bytes for the added device controls, translations and cards, retaining the explicit public-file allowlist and footprint check.

## v0.11.45-alpha - 2026-11-05

- Add the authenticated Power Meter Reading route and separate owner-scoped IoT observations, with optional visible-page refresh. No automatic report or autosave mapping.
- Add opt-in HTTPS device ingestion, per-source credentials, validation, deduplication, conflict detection and persisted upload budgets. Separate telemetry from firmware-timed checkpoints.
- Stage additive migration 009 and local device provisioning; activation and database migration remain explicit deployment steps. No existing readings are changed.

## v0.11.44-alpha - 2026-11-05

- Accept complete raw sharing snapshots in Import readings, including native gas units, T1–T4, Water, refills, manual totals and notes. Validate sections against the sharing formatter before applying; keep electricity-only imports compatible. Full imports require matching observation dates/times and period context.
- Restore the default light workspace for every recording mode. Remove the unused Night theme module, stylesheet and circular theme animation; shift calculations remain unchanged.
- Cover both factories and all three modes with raw round-trip and light-workspace regressions. No dependency, migration or calculation-rule change.
- Expand credential detection in source, comments and documentation to common provider tokens, literal service keys and password-bearing service URLs. Keep diagnostics redacted.

## v0.11.43-alpha - 2026-11-04

- Keep unacknowledged readings in owner-scoped browser recovery as well as the tab copy, so closing a tab or losing a session before sync can be recovered after login. Validate each copy, preserve conflicting copies for explicit selection and remove only acknowledged, unchanged recoveries.
- Preserve the previous account's pending readings before clearing its form. Freeze outgoing workspace/period snapshots so late responses cannot adopt later edits as acknowledged baselines. Reject malformed save acknowledgments and attempt sync when the page becomes hidden.
- Continue automatic storage of incomplete readings in the same period documents. Manual Save still verifies autosave without a new checkpoint or revision. Save status distinguishes pending browser copies from account-confirmed readings.
- Give additional T1–T4 cells and manual gas utility controls explicit Night foreground/background colors, with readable mobile labels and existing validation colors.
- Allow 60 minutes for every current CI job, retaining all checks. No migration, calibration or calculation-rule change.

## v0.11.42-alpha - 2026-11-03

- Reuse one SVG creation helper for charts, guide illustrations, panel icons and glass filters, retaining namespaces, attributes and literal text.
- Index worksheet and Excel source rows once per export. Keep legacy worksheet name matching, exact Excel names, first-match behavior, missing values, zeros and column order.
- Reuse four localized date formatters per monthly table instead of recreating them for each date. Preserve every date label, tooltip and combined period.
- Condense historical footprint comments without changing the asset limit or CI checks. Clarify current R32, raw-copy and manual Save behavior in the documentation.
- Keep the login-throttle integration assertion within its actual database window and explicitly test window reset. Retain the 10-attempt limit, cross-handler checks and 429 requirement.
- No dependency, API, database, stored-format, autosave or calculation-rule change. Historical compatibility paths remain supported.

## v0.11.41-alpha - 2026-11-02

- Default new JRE R32 observations to remaining stock in kg, without temperature or conversion. Consumption remains initial stock plus measured refills minus final stock, for all three periods. UNILAND is unchanged.
- Keep mm as a legacy option with the original temperature interpolation. Preserve units per observation, including refills and shared shift boundaries; existing readings are not relabeled. Clear a reading before changing its unit.
- Keep kg stock increases as nonblocking notices. Raw sharing uses each observation's unit; JRE Excel/report output remains kg. Preserve incomplete autosave, backup/recovery and historical output.
- Recognize identical legacy save acknowledgments across the unit-format upgrade without extra writes. Real reading differences still require conflict resolution.
- Migration 008 adds stale-writer/rollback guards for the new R32 input format. Apply only after passing gates, a private production backup and explicit migration approval; builds do not run migrations.
- Include migration filenames containing digits, such as R32, in migration discovery. Check that every SQL migration is discovered, runs once and retains checksum verification.
- Run one Quality gate per feature PR instead of duplicate push/PR runs. Keep the full checks and allow 45 minutes for browser setup, the complete suite and result uploads. Reuse one gas-observation iterator for units, validation and the UI.

## v0.11.40-alpha - 2026-11-02

- Keep typed date segments in the date fields until Enter or leaving the fields, preventing intermediate years such as 0202 from becoming a recording period. Esc restores the current date. Calendar selections still apply directly; late initial time synchronization does not replace an unfinished date.
- Preserve the existing destination loader and autosave conflict checks. No stored-year correction, database migration or production data repair.
- Let untouched login autofocus receive initial NTP dates. Only actual pending date edits hold those defaults, so a new partial reading can acquire a dated autosave and appear in monitoring.

## v0.11.39-alpha - 2026-11-02

- Default raw copy to all readings: electricity, JRE T1–T4, existing UNILAND Trafo 1–3, gas levels and R32 temperature, Water, recorded refill observations and active manual period totals/notes. Preserve entered units and precision without conversion or consumption calculations.
- Label manual totals and untimed refills separately. Missing optional observations use ____ instead of invented zeros; invalid values stay explicit. Keep the selected Start/End date and time for all three recording modes.
- Retain Electricity only for the existing text-import format. Blank electricity templates, importer, stored readings, autosave and historical output stay unchanged. Scope delayed clipboard feedback to the current preview.

## v0.11.38-alpha - 2026-11-02

- Retouch Night with neutral charcoal surfaces, off-white readings, gray supporting text and quieter table borders. Keep blue for actions, focus and selected controls.
- Make inline gas/Water errors readable in the dark palette. Error messages inherit their error surface color; amber stock-increase notices remain distinct. Preserve all validation and calculation rules.
- Keep the existing circular transition, light-mode styling, white chart exports, print output and autosave unchanged. No new dependencies or migration.

## v0.11.37-alpha - 2026-11-02

- Give NIGHT SHIFT a soft blue-slate panel theme for JRE and UNILAND, including reading fields, results, gas/Water, notices and dialog chrome. Keep warning/error distinctions and readable supporting text.
- Reveal the theme from Reading mode with a native circular mask; contract the dark view back to the selector when returning to another mode. Keep reduced/off-motion, unsupported-browser and forced-color fallbacks, and settle interrupted or stalled transitions on resize, visibility changes, modal opening and account reset.
- Keep gas/worksheet help readable and the glass blank-template modal inside the viewport after scrolling.
- Keep Night stock-increase notices visibly amber while retaining soft contrast and distinct refill errors for both factories.
- Preserve white chart exports and print styling. No calculation, autosave, API, database, account-format or runtime dependency changes.

## v0.11.36-alpha - 2026-11-01

- Use one active autosaved source for monitoring; legacy checkpoints stay in Historian for recovery.
- Remove redundant Save draft. Save flushes pending edits and verifies the same server document without creating checkpoints, revisions or redundant copies. Legacy history remains readable.
- Load an existing destination period before an autosave can replace it, locking entry during loading and preserving offline edits and pending navigation recovery. Add server checks against unacknowledged replacement of archived periods.
- Update gas Save regressions to verify autosaved content without checkpoint writes. Wait for period loading before synthetic entry in legacy navigation and Excel clipboard tests; retain reading, reload and stale-callback assertions.
- Missing-reading incident remains under investigation. No automatic production repair or migration.

## v0.11.35-alpha - unreleased candidate

- Preserved candidate branch failed the full browser gate. Superseded by v0.11.36-alpha; no release tag or production merge.

## v0.11.34-alpha - 2026-10-30

- List exact dates, sources and related periods behind graph conflicts above the plots and monthly table. Explain working copies with missing readings instead of leaving only a count.
- Add an explicit Latest autosave / Saved versions selector for charts and monthly tables. Checkpoint viewing does not restore drafts, change the default autosave view or modify stored reports; copied charts identify saved-version data.
- Do not let periods with no numeric saved values hide valid periods as overlaps. Keep empty copies in Historian/review, preserve real zeros and leave genuine numeric conflicts explicit.
- Handle graph-load failures in all three languages and reject mismatched data-source responses without leaving stale plots.
- Preserve account isolation, recording-kind filters, read budgets, raw readings, saved output and genuine gaps. No database migration, deletion, snapshot merging or inferred readings.
- Wait for viewport observation before testing a short mobile counter animation; keep offscreen effects stopped and all assertions intact. Includes the clock/hover fixes below.

## v0.11.33-alpha - 2026-10-30

- Fix the WIB clock baseline jumping during digit changes. Keep the canonical and animated line boxes aligned and use the measured character widths. Carry directly between the two observed digits without scrolling through unrelated numbers or overshooting, including minute and midnight changes.
- Fix white flashes on blue buttons when entering/leaving hover: keep one highlight layer above an opaque blue fill. Cover Save version, report copy and Excel copy; link labels ease between readable blue colors.
- Preserve NTP sync/status, exact values, immediate clipboard behavior, four-second checkpoint Undo, autosave and saved history. Retain static/reduced-motion fallbacks and stop settled/hidden rendering. No runtime package, API or database migration.

## v0.11.32-alpha - 2026-10-29

- Fix the Save version width: preserve the Fuse grid so the normal and Undo faces share one space, with the same four-second cancellation and checkpoint behavior.
- Let oversized result sidebars scroll with the page so Copy report remains reachable on short screens; retain sticky results when the whole card fits.
- Reuse the supplied Specular edge-light shader on Copy report, retaining native immediate clipboard actions, disabled states, keyboard focus and a CSS fallback.
- Adapt the supplied Counter digit strips/springs for the WIB clock and three dashboard metrics. Use one brief dashboard entrance, then animate only changed digits; preserve exact formatted strings, signs, decimals, units and unavailable markers. Large time corrections and account/factory/period changes snap to current values.
- Keep canonical numbers readable to assistive technology and selectable as text, with optional decorative digits separate from reports/calculations. Stop hidden, covered, reduced/off-motion and settled rendering; no new requests, browser package, NTP logic, database or saved-data change.

- Keep long simulated-time persistence tests static while dedicated tests verify actual motion. Allow 35 minutes for the expanded full CI gate; retain every audit, authorization and browser check.

## v0.11.31-alpha - 2026-10-29

- Restore the question-style welcome slogan in English, Mandarin and Indonesian: "Tired of manual meter recording? Try Energy Record." Keep its wording separate from panel copy changes.
- Give Nitrogen, Oxygen and R32 distinct original vector formula marks (N₂, O₂, R32), with readable shapes and colors instead of generic cylinders.
- Add a small pinned Lucide SVG set for section headings, common actions and status cues, with full upstream notices. Keep visible button labels, native keyboard controls and reduced/off-motion behavior.
- Give valid gas stock-increase notices an amber card, arrow/status icons and readable yellow attention panel for both plants and all periods. Clear the attention state when resolved; invalid inputs/refill errors remain distinct and blocking. Signed calculations and canonical report text stay unchanged.
- Collapse repeated calculation/reference help and redundant report-option explanations. Show the calculated gas result once while retaining note entry, manual values and their recovery when tank mode is disabled. No calibration, autosave, database or account-format changes.

- Add the supplied React Bits Fuse interaction to Save version: 4 seconds to cancel before sending, while autosave continues. Cancel on context changes, preserve checkpoint coalescing and show success only after server confirmation.
- Add the supplied Specular edge-light shaders to native Sign in, with lazy loading, stopped idle frames, bounded DPR and CSS/no-WebGL/reduced-motion fallbacks. Retain auth gates, upstream license and all data formats.

## v0.11.30-alpha - 2026-10-28

- Refresh the signed-in workspace with a soft blue gradient, compact glass navigation, clearer factory/mode controls and coordinated cards. Keep reading fields opaque and sharp; use darker numbers with softer, contrast-checked labels, units and help text.
- Reduce the space before the meter table, group period/backup tools, add small navigation icons and shorten repeated account, gas and shift guidance in all three languages. Clarify that T1-T4 consumption also appears in the current Excel export.
- Add brief workspace entrance and control transitions, with reduced-motion and a panel-motion off switch. Glass blur stays on two small chrome surfaces; table cells have no filters or animation loops.
- Preserve reading alignment, keyboard entry, visible save/conflict status, calculation/report bytes, accounts, autosave timing and all saved history. No runtime dependency, API, database, welcome or login animation changes.

## v0.11.29-alpha - 2026-10-28

- Copy one value-only Excel row to the supplied Daily Monitoring layout: JRE E:AY (47 cells), UNILAND BE:CV (44 cells). Preserve blank AP/CO separators and unknown columns so following values stay aligned. Omit dates, labels and unit suffixes from clipboard data.
- Follow the edited 24-hour, Day/After-production or Night period for electricity, T1–T4, gas and Water. Keep existing net deductions. JRE gas uses kg; UNILAND tank gas uses refill-corrected raw balances in %, mmWC, mmH2O and mm, matching the workbook. Existing manual UNILAND gas/air/R454B totals pass through in their recorded workbook units. Signed stock increases stay negative in numeric consumption cells.
- Show the destination range and column/value preview. Leave unconfirmed equipment and JRE Helium blank, with guidance to fill in Excel. Both Excel copy buttons produce the same tab-separated row; preserve leading/trailing empty cells and scope delayed clipboard fallback to reading dates/times.
- Preserve legacy worksheet output used by saved reports and graphs, all calculation rules, auth and autosave formats. Add column/shift/clipboard regressions without spreadsheet runtime packages or SQL migration. Allow 30 minutes for the growing full CI gate; keep all tests, audit and clipboard-isolated workers.

## v0.11.28-alpha - 2026-10-28

- Import partially filled reading templates without treating blanks as zero or invalid numbers. Preserve existing values only at the same factory/date/time; new dates remain unknown. Keep malformed values, wrong meter counts and required missing equipment atomic and blocking. Accept full-width separators and report a wrong factory directly.
- Keep older operator lists compatible with recently added JRE and UNILAND rows. Leave omitted observations unknown unless an exact timestamp exists; incomplete reports still need readings. Show current schema counts and short localized import feedback instead of stale equipment-specific hints.
- Replace repeated parent/submeter names with a grouped check: parent usage, included total, excess and buttons to the exact component meters. Put these checks first in a larger readable panel. Preserve all ratios, subtraction rules, Structural zero handling and saved historical output.
- Shorten welcome, import and save guidance in all three interface languages. Clear numeric check details when hidden or signed out. Add template-to-table desktop/mobile regressions and hostile-input checks. No migration, dependency, auth or autosave-policy change.

## v0.11.27-alpha - 2026-10-27

- Keep a conflicted autosave pending when input returns to the last locally acknowledged value. Preserve the conflict notice and recovery copy until the operator chooses the account or local copy; do not falsely claim the older value is saved.
- Add controller and desktop/mobile recovery regressions. Preserve autosave timing, request budgets, report calculations, checkpoints and account isolation. No migration or dependency change.

## v0.11.26-alpha - 2026-10-25

- Add JRE Warehouse Lighting as row 32 with ratio x40. Warehouse Area reports its gross x40 usage minus Lighting usage; keep both separate and counted once in sub-meter totals, all three modes, worksheets and new graphs.
- Use zero Lighting consumption for report-start dates before 25 October 2026, including 24-to-25 periods. Preserve actual October 25 readings for the following report; no proration or historical output rewrite.
- Upgrade editable JRE layouts 1–5 to layout 6 (32 rows, 62 meters), preserve raw fields and exact timestamps, and keep old text imports compatible. Only new raw slots dated before the cutoff default to zero; active readings stay blank. Ignore these policy defaults when detecting an empty autosave period. Reject old-layout queued autosaves before they can overwrite newer archived meter fields. Export/template and graph r31 support are included. Correct the report-mode help to match the existing per-period utility workflow. Correct synthetic example generation for deductions on ratio meters. No SQL migration or dependency change.

## v0.11.25-alpha - 2026-10-25

- Keep the title area blank before TechText starts in all three languages. Load welcome effects independently; retain a bounded static fallback for a failed/stalled title effect and native text for reduced motion or JavaScript disabled.
- Show a pill-shaped Back to welcome button with an arrow from the first circle-reveal frame. Keep its space and the form position stable through forward/reverse transitions; both surfaces remain inert during motion.
- Add cold-start, delayed-effect and first-frame regressions. Preserve session/password gates, private workspace clearing, CSP and saved data; no dependency or database change.

## v0.11.24-alpha - 2026-10-24

- Blend blank-template fields, download action and native scrollbars with the light/dark glass surface. Use compact desktop selectors, stacked mobile fields and a larger readable preview without the resize grip. Keep the glass frame, heading and actions in place when the body scrolls.
- Preserve keyboard focus, native scrolling, modal motion and exact template/copy/download content. No calculation, API, database, authentication or dependency change.

## v0.11.23-alpha - 2026-10-24

- Autosave incomplete electricity, gas, Water and notes for both plants and all three recording modes. Persist dated working copies as Revision 1 and use their available values in charts and monthly tables without manual Save; missing or invalid values remain gaps.
- Keep mutable autosaves separate from immutable manual checkpoints. Save version creates a checkpoint only when content differs; repeated identical saves retain the revision number.
- Journal departed periods before the sync delay, coalesce background writes, preserve queued periods in private backup format 5, and keep cross-device conflicts explicit, including pending period recovery after a lost response. Separate tab recovery from server-confirmed save status, and recreate a deleted active workspace before a manual checkpoint.
- Migration 007 adds owner-scoped period autosaves and rollback guards. Apply only after a private backup and explicit production approval; no calculation formula, account role, browser dependency or analytics change.

## v0.11.22-alpha - 2026-10-24

- Match the supplied TechText engine: metrics entrance, dashed character selection, dimension labels, specks, click response and drag springs. Cache glyph artwork and stop settled or hidden rendering; retain strict hover bounds and motion controls.
- Localize the main title, including 能源记录 in Mandarin, and inset the language chevron on welcome and sign-in.
- Add the supplied GlassSurface SVG/frosted treatment to the sign-in card and blank-template dialog, with reversible dialog motion and an accessible X close control. Preserve native forms and templates when optional effects fail.
- No calculation, account, database, saved-data or analytics change; no React runtime or browser dependency.

## v0.11.21-alpha - 2026-10-23

- Remove the welcome frame and replace full-title canvas repainting with cached letter art and browser-composited spring movement. Hover remains limited to the character under the pointer.
- Restore a visible blue/white ASCII horizon and cursor scrambling from the supplied React Bits reference. Bound GPU resolution, input history and render work; preserve static fallback, pause, reduced motion and modal suspension.
- Reverse the circular mask when returning from sign-in to welcome. Preserve form values, keyboard focus and session/password gates when motion is interrupted. No report, calculation, database or analytics change.

## v0.11.20-alpha - 2026-10-23

- Restrict title outlines and spring hover movement to the character under the pointer. Restore filled text immediately on leaving, and stop text painting once the entrance or hover settles.
- Add a bounded React Bits Gradient ASCII background and layered Glass Icons sign-in action. Retain static fallbacks, pause, reduced motion and independent failure handling; reuse the existing frontend without browser dependencies.
- Replace the duplicated welcome content on the white login screen with one centered glass card. Connect the Lattice Loader to actual sign-in success/failure and fade into the existing authenticated or required-password view without delaying authentication.
- Pause welcome rendering under open modal dialogs, release WebGL resources on exit and recreate them safely on Back. No calculation, report, database or analytics change.

## v0.11.19-alpha - 2026-10-23

- Add a fullscreen dark Energy Record welcome with the supplied white Midea logo, React Bits Tech Text and a bounded magnetic sign-in button. Adapt the pinned upstream source for the existing frontend, retain its MIT + Commons Clause notice, and add no browser package or framework.
- Open the white sign-in screen only on request, with a circular mask transition and a Back control. Keep session/password gates, deep links, public blank templates and immutable reports.
- Honor animation pause, reduced motion and motion-off; cap text painting at 30 fps and DPR 1.5, stop hidden/offscreen rendering, and retain HTML text/form fallbacks if decoration fails. No database migration or additional analytics collection.

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
