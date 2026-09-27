# Energy graphs

## Reference and decisions

Reference: 每日能耗数据与图表监控 Daily Energy Data & Graph Monitoring.xlsx, inspected 2026-09-27. Source workbooks and operational readings are not committed or imported. Eight sheets contain 29 charts: nine on JRE Daily Electrical Month 9, seven on UNILAND Electrical Month 9, eight monthly charts on hidden sheets, and five old charts on UNUSED. Hidden monthly sheets and UNUSED are not the default daily presets. Their dates, placeholder zeros and hidden rows are not copied into account history.

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

The authenticated GET /api/graphs endpoint uses the session owner, factory and inclusive report START-date range, joining only the latest revision. Administrators do not gain access to other owners. Responses are private and not cached. Maximum range: 366 dates; maximum records: 1000. Larger requests fail explicitly instead of truncating.

Historian snapshots already retain English report and worksheet output strings. graph-data.js extracts these saved outputs using exact canonical labels and units; it does not recalculate old readings with the current engine. Worksheet output supplies grouped department series, report output supplies other meters and utilities. An absent, duplicate or malformed label becomes null. New output formats require a compatible extractor. Tests cover old manual utilities and calculated gas output. Electrical MWh is converted to kWh for chart display only. Each chart uses one unit; kg gas consumption is distinct from raw tank levels.

Dates on the x axis are report start dates. Missing observations or unavailable values break lines; a real zero is plotted as zero. Reports longer than 24 hours retain their full-period totals, with a visible warning and duration in tooltips/data tables. They are not daily averages. Overlapping reports within the selected start-date range are flagged and excluded from plots, but remain in the data tables for review. No aggregation or interpolation fills dates. Reports starting outside the filter are outside this comparison.

Opening graphs, changing the factory/range or refreshing fetches current revisions. Saving in this tab refreshes an open graph view. Changes made on another device require Refresh or reopening. Unsaved table edits never change graphs. Account changes and closing the dialog clear fetched values and invalidate in-flight responses/exports.

## Configuration and export

Up to 32 graphs per factory; select any available variables with the same unit. Titles can be edited in English and Chinese. Default department/title text remains bilingual regardless of interface language. At least one variable and both title languages are needed before exporting. Add, duplicate, remove, or restore Excel grouping. Layouts, including custom titles, are localStorage settings per account on this browser; readings are never stored there by the graph feature. Layouts do not sync across devices.

SVG exports preserve vector lines/text on a white background. PNG exports and Copy graph are 4000 pixels wide with 400 DPI pHYs metadata. At 400 DPI this supports a 10-inch (25.4 cm) image width. The clipboard or destination app may strip DPI metadata or resize the pasted image; pixel dimensions are the reliable resolution measure. Copy requires a secure context and clipboard permission, and uses image/png. If denied or unsupported, download PNG remains available. Font stack: Arial, Helvetica, Microsoft YaHei, Noto Sans CJK SC, sans-serif; the available device fonts determine Chinese glyphs. Thin 1.4 px series and small markers follow the reference line-chart style, with light grid lines. SVG and PNG share the same renderer. Larger numbers use scientific axis notation. Mobile charts scroll horizontally to keep labels readable.

No new runtime dependency, database table or migration is required. Tests use synthetic examples, never workbook operating data.

References: [PNG physical pixel dimensions](https://www.w3.org/TR/png-3/#11pHYs), [Clipboard image writing](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write).
