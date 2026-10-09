# Energy graphs

## Reference and decisions

Reference: 每日能耗数据与图表监控 Daily Energy Data & Graph Monitoring.xlsx, inspected 2026-09-27. Source workbooks and operational readings are not committed. For maintenance imports, see docs/history-import.md. Eight sheets contain 29 charts: nine on JRE Daily Electrical Month 9, seven on UNILAND Electrical Month 9, eight monthly charts on hidden sheets, and five old charts on UNUSED. Hidden monthly sheets and UNUSED are not the default daily presets. Their dates, placeholder zeros and hidden rows are not copied into account history.

The user requested white charts, thin lines, bold Arial/Helvetica titles, English/Chinese titles and department names, configurable legend entries and manual chart splits. Branch 1 is JRE; Branch 2 is UNILAND. On 2026-09-27 the user explicitly chose the Excel aliases Window A = Window and Window B = Dehumidifier. These aliases never rename inputs, reports or raw exports.

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

## Configuration and export

Up to 32 graphs per factory; select any available variables with the same unit. Titles can be edited in English and Chinese. Default department/title text remains bilingual regardless of interface language. At least one variable and both title languages are needed before exporting. Add, duplicate, remove, or restore Excel grouping. Y-axis scaling defaults to Auto with a zero minimum. Manual accepts finite nonnegative minimum and larger maximum up to 10^15, with a span of at least 0.00000001. Bounds persist per chart and reset to Auto when its unit changes. Invalid bounds block drawing/export. Clipping is only visual: a note is included in the chart and exports when values fall outside the selected bounds, and the data table retains all values.

Layouts, including custom titles and Y-axis bounds, are localStorage settings per account on this browser; readings are never stored there by the graph feature. Layouts do not sync across devices.

SVG exports preserve vector lines/text on a white background. PNG exports and Copy graph are at least 4000 pixels wide, increasing with the chart width up to 16384 pixels, with 400 DPI pHYs metadata. Aspect ratio is preserved. Use shorter ranges for legible printouts of dense data; SVG retains vector detail. The clipboard or destination app may strip DPI metadata or resize the pasted image; pixel dimensions are the reliable resolution measure. Copy requires a secure context and clipboard permission, and uses image/png. If denied or unsupported, download PNG remains available. Font stack: Arial, Helvetica, Microsoft YaHei, Noto Sans CJK SC, sans-serif; the available device fonts determine Chinese glyphs. Thin 1.4 px series and small markers follow the reference line-chart style, with light grid lines. SVG and PNG share the same renderer. Larger numbers use scientific axis notation. Mobile charts scroll horizontally to keep labels readable.

v0.7.0 adds migration 002 for imported history, without a new runtime dependency. Tests use synthetic examples, never workbook operating data.

References: [PNG physical pixel dimensions](https://www.w3.org/TR/png-3/#11pHYs), [Clipboard image writing](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write).

New v0.9.7 JRE reports use the revised Window/Piping/Warehouse grouping; stored graph values remain immutable. Water u4 receives the calculated flow-meter delta from new reports, while older consumption-only history keeps its saved value.

UNILAND tank gas introduced in v0.9.16 uses separate kg0, kg2, kg3 and kg5 metrics, matched only to saved Kg report lines. Legacy u0 (Nm3), u2 (mmWc), and u3 (mmH2O) retain their units and remain null for new kg lines. Old raw-unit values remain null in the kg series. R32 gains a kg series; no raw-level conversion or historical recalculation is performed by graphs.

UNILAND layout 2 keeps the original r0–r27 metric identities despite reordered report rows. Piping is r28 and New Office Building A is r29; both are absent from older history. New HE & Piping worksheet values sum the two equipment rows; old w4 values remain as saved. HE is also independently available as r11.
