# Meter rules

The supplied factory templates and the operator's confirmed date/unit decisions are authoritative. Names, aliases, fixed factors, and output units live in schema.js. Reports stay in their canonical English format regardless of UI language.

## Dates and numbers

Both plants use the starting reading date. The normal period is 08:00 WIB to 08:00 WIB the next day. Combined reports require equal start dates AND equal end dates. A longer period produces a neutral notice. Its report title uses inclusive consumption dates and a day count: 18 September 08:00 to 21 September 08:00 becomes 18-20 SEPTEMBER 2026 - 3 DAYS. It keeps the total unchanged and does not add a CHECK RAW DATA warning. Normal daily titles retain their existing 24 HOURS wording.

Use nonnegative cumulative numbers with at most six decimal places and a maximum of 1000000000000. A single comma or dot is a decimal separator. Thousands separators, exponent notation, unit suffixes, and mixed separators are rejected. Scaled BigInt subtraction preserves small deltas on large counters. Configured factors have at most two decimal places; energy is accumulated at eight-place precision.

Blank or malformed input blocks copying. `-` explicitly marks unavailable data. A decreasing reading is unavailable and produces a check note; reset/rollover is not guessed. A missing component invalidates the equipment total. An increase over both 100 raw units and 50% of the starting value produces a warning without changing the reading. This is a simple threshold, not a historical anomaly model.

## JRE

29 equipment rows, 57 meters. Counts in template order:

```text
1,2,2,6,1,4,13,1,2,1,1,1,1,1,2,2,1,1,1,1,2,1,1,1,1,1,2,2,1
```

- Total is the direct main-meter delta, never a sub-meter sum or x1000.
- Indoor: x250, x40. Outdoor: x1, x40. Window: x1, x90, x90, x40, x40, x1. The sixth meter was Warehouse meter 3.
- Heat Exchanger: x40, x1, x1, x1. Injection Molding: 13 direct meters.
- Air Compressor 1#: x40. New Air Compressor 1# and New Air Compressor 2#: direct. The confirmed inactive exception remains available for the same two rows.
- Cooling water: two direct meters. Dryer: two direct meters. Control: two direct meters. Server Room: two direct meters.
- Piping Building 1#: x40 and direct. The direct meter was Warehouse meter 2. Piping Building 3#: direct. Office: x1000.
- Structural Laboratory includes only Piping Building 1# meter 1 x40. Net Structural usage = direct Structural delta minus Piping 1 meter 1 delta x40, for the same reading period. Subtract at scaled precision before rounding. Keep meter readings and gross meter detail unchanged; reports, worksheet Structural and new graph snapshots use net usage. A missing dependency or negative result becomes unavailable with a check note, never zero. Existing saved reports and imported history are not recalculated.
- Warehouse: x40 only. Utility Area: x1000, x40. Heater: x40.
- Other factors remain as defined in schema.js, not editable through the UI or import.
- Only Air Compressor 1# and New Air Compressor 2# may interpret an unavailable reading as zero after the operator marks the unit inactive. Next day clears this confirmation.

Examples: Office `394,850` to `395,250` = `400.00 kWh`. Utility `660,610 + 29,09` to `660,700 + 29,53` = `107.60 kWh`.

Cross-check compares Total to equipment 2 through 29, using net Structural usage so its included Piping 1 meter is counted once. Gap = sub-meter sum - main Total. Gap percentage = gap / main Total x100, so smaller sub-meter consumption produces a negative gap. The panel and copied reports use the same signed two-decimal format for both kWh and percentage: +20.00, -20.00, or unsigned 0.00. Values rounded to zero never show +0.00 or -0.00. This changes presentation only; stored numeric values and historical output are unchanged. Missing sub-meters make the sub-meter sum and gap unavailable. Coverage may differ, so a gap alone is not an error. A zero main-meter value produces no gap percentage.

Nonzero report values have two decimals; zero is `0 kWh`. The worksheet has an ISO date plus 18 values. Piping All is Piping Building 1# + Piping Building 3# and does not add a report row.

## UNILAND

28 equipment rows, one meter each. Sequential numbering is 1 through 28.

| Equipment                 | Factor                                  | Result unit |
| ------------------------- | --------------------------------------- | ----------- |
| Total                     | 3200 / 1000                             | MWh         |
| Trafo 1, 2, 3             | Direct; cumulative readings already MWh | MWh         |
| Building A, PP hydrant    | 160 / 1000                              | MWh         |
| Building B                | 80 / 1000                               | MWh         |
| SDP pompa, Dp power house | 20 / 1000                               | MWh         |
| Refrigant and LPG area    | 40                                      | kWh         |
| Remaining equipment       | Direct                                  | kWh         |

Preserve the template's `Mwh` spelling for Trafo 3 and `KWh` for the refrigerant/LPG row. Utilities follow all 28 equipment rows.

Keep relevant decimals up to eight places without thousands separators or exponent notation. Example: Building A `3691.4` to `3695.72` = `0.6912 MWh`.

The worksheet has 16 values without a date:

```text
Indoor Area = Indoor + Vacum box indoor
Outdoor Area = Outdoor + Vacum box outdoor + Line compressor outdoor
```

These sums appear only in the worksheet. Individual equipment remain separate in the main report. A missing component makes its grouped value `-`.

## Import, utility data, and storage

Text import accepts one date and a complete factory snapshot, including wrapped Injection Molding entries. Meter counts, duplicate/missing equipment, and numeric syntax are validated before replacement. Wrong imported ratios produce a warning and never override the schema. Saved warnings are revalidated against current factors during draft restore and calculation, including legacy warnings stored only as text. Resolved mismatches are removed; remaining messages use the current factor. Equal valid readings produce zero consumption and do not themselves create ratio warnings. Saved report output is never rewritten. One- or two-column Excel pastes are planned atomically; an invalid cell or oversized block changes nothing.

Utilities are optional direct consumption values, except enabled JRE tank gas calculations described in [gas rules](gas.md). Those gas values come from converted raw observations and refill events. A note without a value blocks copying. Water notes are retained. Drafts use an account-scoped sessionStorage backup and synchronize to one replaceable account workspace, including incomplete entries. Legacy guest localStorage drafts stay separate. Language uses a separate key. Clearing a saved draft does not clear the currently open table. Next day carries end readings forward, clears new end readings/utilities/inactive flags, and autosaves the unfinished draft. See docs/accounts.md for synchronization and conflict handling.

## Raw reading export

Raw export is a dated observation, not a consumption report. It uses the selected start/end column and its own date, defaults to end, and includes all electricity rows in schema order. It preserves decimal comma/dot, trailing zeros, and explicit `-`; it removes only surrounding whitespace and a redundant leading plus. Ratio annotations are never applied to the values. Decreases remain the observed cumulative numbers, and inactive-unit flags never invent raw zero readings. Empty/invalid selected readings or dates block copying; the opposite column and daily utilities do not affect raw export. Output can be imported back as a single reading column.

## JRE water and layout upgrades

Water uses cumulative m³ end minus start at scaled precision, with up to six decimal places and the same cumulative input limit as electricity. It belongs to the starting report date or full combined period; do not divide a multi-day total. Blank water fields are optional; one missing or malformed reading blocks a completed report but remains saveable as a draft. Explicit unavailable or decreasing readings report - with a check note. Zero is valid. Raw water readings follow matching dates and Next day; legacy consumption-only utilities remain available without invented readings. New raw readings replace the manual amount for calculation. UNILAND utility entry is unchanged.

JRE meter layout 2 has 6 Window, 2 Piping 1 and 1 Warehouse meters, retaining 57 meters total. A complete legacy layout is recognized by all meter counts; old Warehouse meter 2 moves to Piping 1 meter 2 and meter 3 moves to Window meter 6. Raw precision and warning coordinates are preserved. Draft restore, historian loading for editing and full legacy text import use this mapping; mixed or unknown layouts fail validation. Stored snapshots and imported history are never rewritten. Current raw export uses only the new layout. A stale client must reload before saving a completed JRE report.
