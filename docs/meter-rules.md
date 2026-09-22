# Meter rules

The supplied factory templates and the operator's confirmed date/unit decisions are authoritative. Names, aliases, fixed factors, and output units live in schema.js. Reports stay in their canonical English format regardless of UI language.

## Dates and numbers

Both plants use the starting reading date. The normal period is 08:00 WIB to 08:00 WIB the next day. Combined reports require equal start dates AND equal end dates. A longer period produces a warning and its actual hour count.

Use nonnegative cumulative numbers with at most six decimal places and a maximum of 1000000000000. A single comma or dot is a decimal separator. Thousands separators, exponent notation, unit suffixes, and mixed separators are rejected. Scaled BigInt subtraction preserves small deltas on large counters. Configured factors have at most two decimal places; energy is accumulated at eight-place precision.

Blank or malformed input blocks copying. `-` explicitly marks unavailable data. A decreasing reading is unavailable and produces a check note; reset/rollover is not guessed. A missing component invalidates the equipment total. An increase over both 100 raw units and 50% of the starting value produces a warning without changing the reading. This is a simple threshold, not a historical anomaly model.

## JRE

29 equipment rows, 57 meters. Counts in template order:

```text
1,2,2,5,1,4,13,1,2,1,1,1,1,1,2,1,1,1,1,1,2,1,1,1,1,3,2,2,1
```

- Total is the direct main-meter delta, never a sub-meter sum or x1000.
- Indoor: x250, x40. Outdoor: x1, x40. Window: x1, x90, x90, x40, x40.
- Heat Exchanger: x40, x1, x1, x1. Injection Molding: 13 direct meters.
- Cooling water: two direct meters. Dryer: two direct meters. Control: two direct meters. Server Room: two direct meters.
- Piping Building 1#: x40. Piping Building 3#: direct. Office: x1000.
- Warehouse: x40, x1, x1. Utility Area: x1000, x40. Heater: x40.
- Other factors remain as defined in schema.js, not editable through the UI or import.
- Only Air Compressor 1# and New Air Compressor 2# may interpret an unavailable reading as zero after the operator marks the unit inactive. Next day clears this confirmation.

Examples: Office `394,850` to `395,250` = `400.00 kWh`. Utility `660,610 + 29,09` to `660,700 + 29,53` = `107.60 kWh`.

Cross-check compares Total to equipment 2 through 29. Missing sub-meters make the sub-meter sum and gap unavailable. Coverage may differ, so a gap alone is not an error. A zero main-meter value produces no gap percentage.

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

Text import accepts one date and a complete factory snapshot, including wrapped Injection Molding entries. Meter counts, duplicate/missing equipment, and numeric syntax are validated before replacement. Wrong imported ratios produce a warning and never override the schema. One- or two-column Excel pastes are planned atomically; an invalid cell or oversized block changes nothing.

Utilities are optional direct consumption values, never inferred. A note without a value blocks copying. Water notes are retained. Drafts use localStorage key midea_energy_draft_v4 and are written only on Save draft. Language uses a separate key. Clearing a saved draft does not clear the currently open table. Next day carries end readings forward, clears new end readings/utilities/inactive flags, and does not save automatically.
