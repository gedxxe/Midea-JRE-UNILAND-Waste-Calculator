# JRE and UNILAND tank consumption

Scope: LPG, Oxygen, Nitrogen and R32 tank consumption for JRE and UNILAND. Water for both plants uses cumulative flow readings; UNILAND Air Compressor and existing R454B values remain manual. This feature uses tank inventory, not cumulative flow counters.

## Operator workflow

Open the selected factory's gas consumption section and enable Calculate from tank readings for each gas being recorded. Enter Before Work and After Work in the instrument's raw units. After Work normally means the next morning's Before Work. Dates follow the electricity period, normally 08:00 WIB to 08:00 WIB; the report uses the starting date. The UI makes both endpoints visible.

Add each refill in time order, entering Before Refill and After Refill. No refill means an empty event list. Up to ten events per gas and period are supported. R32 needs a temperature for every available observation, including refill observations. There is no assumed temperature. Decimal comma or dot is accepted, with at most six decimal places. Use - for an unavailable observation. Zero is outside these source tables and is not silently extrapolated.

Each observation is converted to kg first. Consumption is initial kg + sum(after-refill kg - before-refill kg) - final kg. Do not convert a difference in raw levels. R32 uses each observation's own temperature. Increasing inventory between refills, decreasing inventory during refill, incomplete events, invalid syntax and out-of-range inputs block copying and saving. Explicit unavailable readings produce an unavailable result with a check note. Calculations retain precision until report formatting, which uses up to six decimals.

Next day carries enabled gases' final raw readings and temperatures into the next initial reading, then clears final readings and refills. Invalid final readings block this action. Undo restores removed refills and previous drafts. Language changes do not change canonical report text.

Disabled tank calculations preserve existing manual utility data. Enabling a gas replaces its report value with the calculated result and makes its manual value field read-only. Disabling it restores the preserved manual value. Manual values and notes remain available within each gas card. The section below gas in both plants is Water, entered as cumulative m³ flow-meter readings. No old kg value is reverse-converted into an invented raw reading.

## Reference data and provenance

JRE source: the user-supplied R32 O2 N2 and LPG Calculator workbook, inspected on 2026-09-25, including all 12 hidden reference, engine and guide sheets. Calibration ID: jre-2026-09-v1. gas-tables.js contains only numeric level/mass calibration points, not workbook example inputs, operating history, workbook files or private file paths.

| Gas      | Input range                       | Source cells                                           | Method                                                           |
| -------- | --------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| LPG      | 1–100 %                           | LPG Reference Data 液化气原始数据 B8:B107 and D8:D107  | Linear interpolation of adjacent mass values                     |
| Oxygen   | 10–4220 mmWC (source label mmH₂O) | O2 Reference Data 氧气原始数据 B8:B429 and D8:D429     | Linear interpolation of source Total kg                          |
| Nitrogen | 10–3060 mmH₂O                     | N2 Reference Data 氮气原始数据 B8:B313 and D8:D313     | Linear interpolation of source Total kg                          |
| R32      | 50–6967 mm; -20–50 °C             | R32 Reference Data R32原始数据 B8:B147, D7:K7, D8:K147 | Bilinear interpolation of original mass by level and temperature |

R32 temperature nodes: -20, -10, 0, 10, 20, 30, 40, 50 °C. Fractional values such as 33.5 °C are valid. The engine uses original mass values, not density multiplied by rounded volume. O2 and N2 follow the workbook's fixed vessel conditions and Total kg, including gas and liquid, without introducing additional pressure or temperature corrections.

LPG follows the workbook's corrected working table. Its notes identify corrections at 52% volume, 56% mass and 97% volume. Only mass is needed here; the corrected 56% value is 9709.98 kg. The supplier filename/capacity labels disagree, so table limits are calculation bounds, not approved filling limits. The original supplier PDFs were not independently supplied or checked in this task. Reference estimates inherit the workbook's assumptions and rounding.

The Gas And Water Consumption workbook supplies the Before Work, Before Refill, After Refill and After Work structure. Only its layout and formula relationships are used. Operational records are not imported into source control.

## UNILAND calibration

Source: the user-supplied UNILAND R32 O2 N2 and LPG Calculator workbook, inspected 2026-10-09. Read all four calculators and all 12 hidden reference/engine/guide sheets without changing the source workbook. Calibration ID: uniland-2026-10-v1.

| Gas      | Input range                 | Source cells                                           | Method                                             |
| -------- | --------------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| LPG      | 1–100 %                     | LPG Reference Data 液化气原始数据 B8:B107, D8:D107     | Adjacent printed mass values, linear interpolation |
| Oxygen   | 10–4320 mmWC (source mmH₂O) | O2 Reference Data 氧气原始数据 B8:B439, D8:D439        | Adjacent Total kg, linear interpolation            |
| Nitrogen | 10–3060 mmH₂O               | N2 Reference Data 氮气原始数据 B8:B313, D8:D313        | Adjacent Total kg, linear interpolation            |
| R32      | 50–6967 mm; -20–50 °C       | R32 Reference Data R32原始数据 B8:B147, D7:K7, D8:K147 | Original mass, bilinear interpolation              |

The hidden engines validate these ranges, use MATCH/INDEX to select neighboring points, and interpolate mass in C20. Their upper-bound bracket is capped at the penultimate point. All R32 mass and temperature nodes are identical to the supplied JRE table, so that data is shared; LPG/O2/N2 mass tables are separate. No density, volume or pressure correction is added.

Source inconsistencies: the O2 guide still mentions 4220 in one quick-start note, but its engine C7 and full reference table both end at 4320. Use 4320. The LPG guide explicitly states that the printed density/capacity disagree with its liter/kg columns. Follow D8:D107 unchanged, as the engine does, rather than recomputing kg from liters or applying JRE corrections. The 100% node is 9470.59 kg. These bounds are calculation ranges, not approved filling limits. Supplier PDFs were not independently supplied or verified here. The N2 liquid-volume header differs from the guide; this feature uses only its Total kg column.

UNILAND manual gas indices remain LPG 0, Oxygen 2, Nitrogen 3 and R32 5, preserving existing drafts. When tank calculation is enabled, the UI and report use Kg for that gas; otherwise the original manual value and unit remain. Water has its own cumulative-reading section below gas. Air Compressor and existing manual R454B fields remain within gas; Daily utilities is removed. New R454B conversion and JRE support are deferred pending a datasheet. Historical snapshots are never rewritten. Graphs add kg0/kg2/kg3/kg5 series and keep u0/u2/u3 in their previous units. A saved value never crosses units automatically.

## Persistence and verification

Version-4 drafts support an optional gas object for each factory with a calibration ID and raw observations. Missing gas data in older drafts means disabled tank calculations. Unknown or other-factory calibration IDs and malformed event structures are rejected. Historian snapshots retain raw values, per-observation temperatures, refills, calculated masses, calibration ID and app engine version. Server calculations use the bundled tables and ignore client-provided mass values. Existing JSON snapshot columns support this without a database migration.

Tests cover all source mass nodes, interpolation between both axes, boundaries, malformed inputs, unavailable readings, multiple refills, inventory direction, old drafts, next day, undo, language switching and server recalculation. Database tests round-trip synthetic gas data; browser tests use synthetic readings and mocked services.

Changing period dates carries only observations whose dates match the new endpoints, including their temperatures. Unknown dates stay empty. Refill events and manual utility amounts belong to the old period and are cleared; enabled tank selections remain. Undo restores the previous period. Date changes permit incomplete observations in a draft; report validation still blocks incomplete calculations.
