# Energy graphs

## Reference and decisions

Reference: 每日能耗数据与图表监控 Daily Energy Data & Graph Monitoring.xlsx, inspected 2026-09-27. Source workbooks and operational readings are not committed. For maintenance imports, see docs/history-import.md. Eight sheets contain 29 charts: nine on JRE Daily Electrical Month 9, seven on UNILAND Electrical Month 9, eight monthly charts on hidden sheets, and five old charts on UNUSED. Hidden monthly sheets and UNUSED are not the default daily presets. Their dates, placeholder zeros and hidden rows are not copied into account history.

The original request used white charts, thin lines and bold Arial/Helvetica titles with bilingual labels. From v0.11.14-alpha, chart titles, legends, axes, tooltips, data tables and image exports use only the selected English, Mandarin or Indonesian interface language. Chart display aliases never change report text or graph identities. Branch 1 is JRE; Branch 2 is UNILAND. On 2026-09-27 the user explicitly chose the Excel aliases Window A = Window and Window B = Dehumidifier. These aliases never rename inputs, reports or raw exports.

## Preset mapping

| Factory / department              | Charts and variables                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| JRE, Branch 1 / 一厂              | Outdoor + Window A + Window B + Heat Exchanger; Indoor + Piping All                                |
| JRE, Injection Molding / 注塑     | Injection Molding; Crusher Machine + Cooling Tower Injection                                       |
| JRE, Quality / 品质部             | Control Room + New Laboratory; Structural Laboratory; IQC & OQC                                    |
| JRE, Logistics / 物流部           | Warehouse + Charging Forklift                                                                      |
| JRE, Administration / 行政部      | Office                                                                                             |
| UNILAND, Branch 2 / 二厂          | Outdoor Area; Indoor Area + HE & Piping                                                            |
| UNILAND, Injection Molding / 注塑 | Injection Molding; Machine Stamping                                                                |
| UNILAND, Quality / 品质部         | PCB Trial Line; 10HP Enthalpy Lab + 20HP Climate Chamber + OQC Testing Room B + IQC Testing Room B |
| UNILAND, Logistics / 物流部       | Charger Forklift Area                                                                              |

Semicolons separate charts. Worksheet columns define grouped values: JRE Piping All = Piping #1 + Piping #3; UNILAND Indoor Area = Indoor + Vacuum Box Indoor; Outdoor Area = Outdoor + Vacuum Box Outdoor + Outdoor Line Compressor Area. Grouped and component series are both selectable, so a custom selection may intentionally include both. Graphs do not add selected series into a new total.

## Saved records and correctness

Imported consumption has its own immutable source records and no cumulative meter draft. Graph tables and tooltips label it as Excel history. A saved meter report supersedes any imported interval that overlaps it; the imported record remains stored and visible in the data table but is not plotted.

The authenticated GET /api/graphs endpoint uses the session owner, factory and inclusive report START-date range, joining only the latest revision. Administrators do not gain access to other owners. The database query projects only saved report and worksheet text; raw readings and other unused snapshot fields do not travel to the graph handler. Responses are private and not cached. Maximum range: 366 dates; maximum records: 1000. Larger requests fail explicitly instead of truncating.

Starting in v0.9.1-alpha, newly calculated JRE Structural values exclude Piping Building 1# consumption. Graph extraction uses the stored result without subtracting again. Older saved reports and imported consumption keep their original values; changing them requires an explicit correction.

Historian snapshots already retain English report and worksheet output strings. graph-data.js extracts these saved outputs using exact canonical labels and units; it does not recalculate old readings with the current engine. Worksheet output supplies grouped department series, report output supplies other meters and utilities. An absent, duplicate or malformed label becomes null. New output formats require a compatible extractor. Tests cover old manual utilities and calculated gas output. Electrical MWh is converted to kWh for chart display only. Each chart uses one unit; kg gas consumption is distinct from raw tank levels.

Every non-excluded period has its own x-axis label. Periods use equal slots, not proportional calendar spacing. A daily record is labelled 18/09; a reading from 18 September 08:00 to 21 September 08:00 is labelled 18–20/09. Combined totals stay one point. Missing periods still break lines; no sampled ticks hide record labels. Longer selections widen the scrollable SVG instead of dropping labels. Missing observations or unavailable values break lines; a real zero is plotted as zero. Reports longer than 24 hours retain their full-period totals, with a neutral notice and duration in days in tooltips/data tables. They are not daily averages. Overlapping reports within the selected start-date range are flagged and excluded from plots, but remain in the data tables for review. No aggregation or interpolation fills dates. Reports starting outside the filter are outside this comparison.

Opening graphs, changing the factory/range or refreshing fetches current revisions. Saving in this tab refreshes an open graph view. Changes made on another device require Refresh or reopening. Unsaved table edits never change graphs. Account changes and closing the dialog clear fetched values and invalidate in-flight responses/exports.

Starting in v0.11.8, a converted gas stock increase is saved as an explicit +amount Kg (measured stock increase) report line. Consumption extractors deliberately leave this as null, breaking the series rather than counting the absolute amount as usage or inventing zero. Its amount and notice remain visible in the saved report; ordinary consumption retains the same graph keys. From v0.11.9, extract utility values only before the canonical CHECK RAW DATA section, since a notice can repeat the gas label. Positive consumption with a notice remains numeric; duplicate measured values in the report body remain ambiguous and yield null. Old report strings are never rewritten.

## Configuration and export

Up to 32 graphs per factory; select any available variables with the same unit. Edit the title for the current interface language; the three language titles are kept separately. Known automatic legacy titles become concise titles, while custom English/Chinese titles stay unchanged. Indonesian titles receive a local default until edited. Export requires one variable and a nonempty title for the selected language. Add, duplicate, remove, or restore Excel grouping. Y-axis scaling defaults to Auto with a zero minimum. Manual accepts finite nonnegative minimum and larger maximum up to 10^15, with a span of at least 0.00000001. Bounds persist per chart and reset to Auto when its unit changes. Invalid bounds block drawing/export. Clipping is only visual: a note is included in the chart and exports when values fall outside the selected bounds, and the data table retains all values.

Layouts, including custom titles and Y-axis bounds, are localStorage settings per account on this browser; readings are never stored there by the graph feature. New edits use midea_graph_layout_v2_ keys, including separate shift suffixes. Valid v1 layouts are read and upgraded in memory when v2 is absent; old keys are never overwritten. Code rollback can read the prior v1 layout; new preferences remain recoverable in v2. Layouts do not sync across devices.

SVG exports preserve vector lines/text on a white background. PNG exports and Copy graph are at least 4000 pixels wide, increasing with the chart width up to 16384 pixels, with 400 DPI pHYs metadata. Aspect ratio is preserved. Use shorter ranges for legible printouts of dense data; SVG retains vector detail. The clipboard or destination app may strip DPI metadata or resize the pasted image; pixel dimensions are the reliable resolution measure. Copy requires a secure context and clipboard permission, and uses image/png. If denied or unsupported, download PNG remains available. Font stack: Arial, Helvetica, Microsoft YaHei, Noto Sans CJK SC, sans-serif; the available device fonts determine Chinese glyphs. Thin 1.4 px series and small markers follow the reference line-chart style, with light grid lines. SVG and PNG share the same renderer. Larger numbers use scientific axis notation. Mobile charts scroll horizontally to keep labels readable.

v0.7.0 adds migration 002 for imported history, without a new runtime dependency. Tests use synthetic examples, never workbook operating data.

References: [PNG physical pixel dimensions](https://www.w3.org/TR/png-3/#11pHYs), [Clipboard image writing](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write).

New v0.9.7 JRE reports use the revised Window/Piping/Warehouse grouping; stored graph values remain immutable. Water u4 receives the calculated flow-meter delta from new reports, while older consumption-only history keeps its saved value.

UNILAND tank gas introduced in v0.9.16 uses separate kg0, kg2, kg3 and kg5 metrics, matched only to saved Kg report lines. Legacy u0 (Nm3), u2 (mmWc), and u3 (mmH2O) retain their units and remain null for new kg lines. Old raw-unit values remain null in the kg series. R32 gains a kg series; no raw-level conversion or historical recalculation is performed by graphs.

UNILAND layout 2 keeps the original r0–r27 metric identities despite reordered report rows. Piping is r28 and New Office Building A is r29; both are absent from older history. New HE & Piping worksheet values sum the two equipment rows; old w4 values remain as saved. HE is also independently available as r11.

UNILAND layout 3 adds the second lab observation as r30 and keeps original r0–r29 identities. Report extraction recognizes both original and layout-2 numbering after the lab insertion. Three-meter equipment totals appear only in new saved output; old snapshots and worksheet history stay immutable.

UNILAND layout 4 adds SV window (r31), Painting (r32) and Dryer (r33) as separate kWh variables. Existing worksheet identities w0–w15 and report identities r0–r30 remain stable. Pre-expansion report numbers remain aliases; missing new equipment in historical reports is null, never zero. The new meters do not silently join an existing worksheet department sum.

## Working-hours graphs

The mode selector filters 24 HOURS, After production or Night at the owner-scoped API. Shift graphs exclude imported daily consumption. Gas/Water and manual utility series are available for newly saved shift reports; older electricity-only reports retain null utility values. No daily utility amounts are inferred or copied into shift history. Subtitles identify 24 hours, After production or Night shift in the selected language. Each shift start date is one point with actual reading dates, times and duration in the data table. A date-axis slot does not imply 24-hour consumption or an average. Values come from immutable saved output. Layouts use separate per-account keys for all three modes; switching modes invalidates old in-flight responses and exports.

JRE layout 3 retains w0–w17 and all previous report identities. New saved Dehumidifier values include Vacuum Box; Piping #3 uses x40; Electricity Building 3# (r9) is net of Vacuum Box and Piping #3. Area Repair Injection Molding is available separately as r29. Historical output is read exactly as saved, including older gross Building 3 values; absent Repair history is null. No new worksheet column or preset aggregation is added.

JRE layout 4 keeps all graph keys. New Window values include meter 6 x40, and new Piping/Piping All values include meter 3 net of that Window component. Graphs read these saved results without subtracting again; previous results stay unchanged.

JRE layout 5 adds Charging Forklift Building 2 as r30, separate from the existing Building 3 worksheet forklift series w16. Newly saved Building 2 r18 values also deduct this direct usage. Existing keys, worksheet columns and presets stay unchanged. Historical reports without the new row yield null for r30; their Building 2 values remain as saved.

## Simplified viewing (v0.11.14-alpha)

Factory, dates, recording kind and department are the primary controls. Department filtering is local and sends no API request. Original 9/7 workbook splits remain, including existing four-series comparisons. The settings panel recommends 2–3 related variables and splitting different scales, without silently limiting or deleting custom series. Title/variables and advanced units/Y bounds stay inside Configure graph; layout add/reset are inside Manage charts. Copy graph remains direct; Download contains PNG/SVG. Details about source, scale and resolution are collapsed. JRE and UNILAND remain uppercase. Display terms are explicitly mapped in i18n/graph-labels.js; common production terms remain familiar in Indonesian. User-entered titles are used verbatim for their language.

Entrance animation applies to chart cards for 250 ms on opening after data loads. It does not animate values, axes or SVG paths, and does not loop/replay on local filters or language edits. Reduced motion and the optional html data-graph-motion="off" attribute disable it. Copy/download serialize static SVG, retaining PNG dimensions and DPI metadata. In-flight image operations are scoped to the current account, data, chart SVG and open dialog; changed titles/variables/languages invalidate an outdated result.

Roles and owner-scoped API reads are unchanged. Viewer accounts and shared dashboard settings are separate work. No database migration, new dependency or operating-data rewrite is included.

## Monthly matrix and exploration (v0.11.15-alpha)

The monitoring dialog offers Charts and Monthly table. The table shows the selected month/year above full localized weekday/date headers. Columns cover every calendar day, with frozen equipment names, sticky date headers, department/search filters and row/column highlights. Metrics keep their saved graph identities and units; grouped worksheet and component rows are separate comparisons, not an additive total. Values come from the existing owner-scoped endpoint, including saved utility measurements. Missing/invalid values use a dash while a real zero remains zero.

Only periods whose report start is in the selected month are included, matching graph/history filtering. A combined period occupies one merged cell, retains its full date range and full saved amount, and is never prorated. When it ends next month, the last cell is clipped to the current calendar but labelled with the full period; the next month does not duplicate that amount. Overlapping, superseded or ambiguous records are excluded from values and listed separately. Month selection changes the existing date range; table/chart switches and local filters reuse loaded data where possible. Closing or changing accounts clears the matrix and invalidates old requests.

Shape-preserving cubic paths connect only contiguous saved observations. Control points are bounded by adjacent values and missing periods still break paths. Curves are visual guides, not inferred readings. Shared tooltips and crosshairs snap to actual saved periods, including combined totals. Pointer hover, touch tap and Left/Right/Home/End keyboard exploration retain exact values. Click/Enter/Space on a legend temporarily hides/shows that series; colours remain stable, Y scaling uses visible series and the data table retains all configured values. All-hidden charts cannot be copied. Hidden state is not persisted; reopening restores all series.

Tooltip/crosshair elements live outside the SVG and never enter SVG/PNG/clipboard exports. Legend state remains visible in exported static charts. Reduced motion disables transitions; exports retain 400 DPI and the existing pixel limits. No graph-server, database or authentication changes are involved.

## Scroll and full-window viewing (v0.11.16-alpha)

The dialog uses normal document flow with its own vertical scroll. The monthly table has a bounded viewport of at least 240 CSS pixels instead of taking a shrinking flex remainder. Native wheel/touch scrolling can continue into the dialog at table boundaries; the background page remains outside the modal. Date headers and equipment names remain frozen inside the table.

Full screen expands the dialog to the browser viewport using CSS, without the native Fullscreen API or a permission prompt. Monthly table opens with Filters collapsed to give the readings more room. Entering full-window view also collapses Filters; filters remain manually accessible, and leaving restores their previous disclosure state. The selected factory, month/year and recording kind remain visible above the table. Escape restores the normal window first, then closes it on a second press. Closing or switching accounts resets the presentation state. No preference, API, database or report-format change is involved.

Regression checks cover a reproduced 98-pixel table at 1280×600, actual wheel chaining in both directions, full-window geometry, short desktop viewports, portrait/landscape phones, language labels, filter restoration and account cleanup. Reduced CSS viewports exercise limited layout space; these are not a claim of testing every browser's zoom implementation.

## v0.11.23 autosave

Latest account-confirmed partial period snapshots now feed monitoring, with missing values kept as gaps. Manual checkpoints remain immutable and identical saves do not add revisions. See [autosave design, limits and migration 007](autosave.md). Production needs an updated private backup and explicit approval before migration.

## JRE Warehouse Lighting (v0.11.26-alpha)

New output keeps Warehouse in worksheet metric w15 as net consumption after Lighting, and adds separate Lighting metric r31 (kWh) under Logistics. Labels follow the selected interface language. Existing nine JRE presets, worksheet width and custom selections stay unchanged; Lighting is selectable and available in the monthly matrix. Extraction uses saved output only: older records without Lighting remain null for r31 and retain their original Warehouse value. Newly calculated pre-cutoff reports contain the confirmed zero; old records are not backfilled.

## Working copies, checkpoints and period review (v0.11.34)

Latest autosave remains the default. Saved versions uses the latest manual checkpoint for each exact owner/factory/kind/start/end identity; it never restores a working draft or combines values from different snapshots. The selected source is included in checkpoint chart exports and monthly-table hints. Existing imported history retains its labels and precedence. Source selection is temporary and resets on account changes. Both views use the same bounded, parameterized owner-scoped query and read budget.

Review periods shows dates, source/revision, status and related periods above charts and monthly tables. Partial working copies can have no calculable pairs even while their raw inputs remain stored; zeros are never substituted. A button can switch to existing manual checkpoints without changing those inputs.

Only periods containing a finite saved value participate in overlap detection. Empty copies remain in Historian and review but do not hide valid points, merge blank monthly cells or break otherwise contiguous valid series. Recorded zero is finite data. Overlapping numeric periods remain explicit conflicts; no timestamps, completeness or checkpoint priority guesses resolve them.
