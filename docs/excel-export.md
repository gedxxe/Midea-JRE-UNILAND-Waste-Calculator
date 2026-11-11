# Excel row export

The current destination is the supplied Daily Monitoring worksheet, header row 3. Copy is a single tab-separated row of values. Dates, headings, unit suffixes, formulas and notes are excluded from the clipboard.

| Factory | Start | End | Cells | Empty separator |
| ------- | ----- | --- | ----- | --------------- |
| JRE     | E     | BA  | 49    | AR              |
| UNILAND | BE    | CV  | 44    | CO              |

Choose the current 24 HOURS, Day/After-production or Night mode. Both copy entry points use that period, independently of the bundled factory-report selection. Day uses morning to evening; Night uses evening to next morning. The operator selects the matching destination row in Excel.

## Mapping

JRE E:H are T1-T4 consumption. I is the signed sub-meter-minus-main gap; J is the sub-meter sum. K:AQ contain the equipment rows and two compressor performance columns in the workbook order, using current net deductions, including Building 2, Building 3, Piping 1, Structural and Warehouse. AB is cumulative-flow consumption in Nm³ and AC is compressor electricity/flow in kWh/Nm³. They follow New Air Compressor 1#, New Air Compressor 2#, Dryer and Cooling Tower New Air Compressor, and Air Compressor 1# (X:AA). AR stays empty; AS:AV are LPG/Oxygen/Nitrogen/R32 kg. AW:AZ Helium have no current source and stay empty. BA is Water m³. UNILAND still starts at BE.

UNILAND BE:CN contain individual equipment and Trafo values in workbook order. Building/Trafo quantities keep MWh; the other equipment keep kWh. BE is Indoor alone, BG Outdoor alone and BH Heat Exchanger alone; Vacuum boxes, line compressor and Piping have separate columns. BF Jaringan Indoor, BJ DP External A, BO Server Room and CJ Spot Welding remain blank. No mapping is inferred for 10HP Lab (2); it is not substituted for Spot Welding. CP is manual Air Compressor, CQ Nitrogen, CR Oxygen, CS LPG, CT Water, CU manual R454B (the reference header says R45) and CV R32.

The explicit column map lives in excel-row.js. New equipment without a confirmed target is listed for review rather than appended to the clipboard and shifting the range.

## Air Compressor, gas and Water

JRE flow applies to periods starting on or after 12 November 2026 at 08:00 WIB. It uses cumulative End minus Start in Nm³. The ratio is the sum of the four named compressor electricity consumptions, after their existing ratios, divided by that flow. Zero electricity is valid. If flow is zero, missing, invalid or unavailable, or a required electricity component is missing, the ratio is blank. Other worksheet cells remain copyable. Earlier periods leave both new columns blank; raw readings and old saved output are retained.

JRE tank gas uses the existing signed kg result at its six-decimal display precision. Existing manual JRE values are already kg. UNILAND tank gas uses raw Start + sum(After refill - Before refill) - End, at the same six-place reading precision. Nitrogen is mmH2O, Oxygen mmWC, LPG percent and R32 mm. This is a raw reading balance; there is no additional mass, volume or temperature conversion. The existing tank validation and canonical kg reports remain unchanged.

Disabled tank calculations use their period-owned manual totals: UNILAND LPG Nm3, Air Compressor Nm3, Oxygen mmWC, Nitrogen mmH2O, R32/R454B as entered for the reference raw columns. No R454B conversion is added. Water uses active-period cumulative m3 difference, or retained legacy consumption where raw readings are absent.

A measured stock increase is negative numeric consumption in Excel, with a visible notice. The factory report retains its existing +amount stock-increase label. Unknown optional fields stay empty, genuine zero stays 0 and unavailable results use -. Notes and raw user text are never copied as formulas.

## Pasting and compatibility

Use an empty, unmerged destination row at E or BE. The source workbook contains historical merged cells and formulas inside the requested ranges. Pasting a row replaces those cells; the website does not edit/unmerge the workbook or preserve formulas at the target. Existing formatting remains controlled by Excel. Main Total/date/other columns outside the requested ranges are excluded.

Leading, middle and trailing empty slots remain part of the TSV. Manual-copy fallback selects the same text. Delayed clipboard callbacks are scoped to the account, preview, factory, mode and reading dates/times.

Legacy worksheet.js output is retained for immutable report snapshots and existing graph mappings. The new clipboard model does not add database fields, recalculate saved records, change meter factors or create a report revision.
