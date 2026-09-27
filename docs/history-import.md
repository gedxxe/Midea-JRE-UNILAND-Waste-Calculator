# Historical consumption import

This maintenance workflow imports already-calculated consumption, not cumulative readings. Imported history is private to the selected owner and joins future saved reports in Graphs. It does not create an editable meter report, raw export, or Next day baseline. No source workbook or operational values belong in Git, logs, public build files, or documentation.

## Reference scope

The user chose September 2026 JRE and UNILAND from the supplied Daily Energy Data & Graph Monitoring workbook. Read the two September sheets, including cached formula values, and validate the current graph worksheet mappings. Do not import April–August, monthly summaries or UNUSED. Rows with no explicit numeric source readings are blank templates even if a SUM formula returns zero. Preserve explicit zeros in populated rows. A label such as 11–13 means one consumption total for those dates, stored from September 11 at 08:00 to September 14 at 08:00 WIB. Never divide or interpolate it into artificial daily values.

## Data contract

The private JSON manifest contains version 1, sourceName (filename only), sourceSha256, and records. Each record contains plant, startDate, endDate (exclusive), values keyed by graph worksheet IDs w0..., sheet, row and range. Values are finite nonnegative kWh numbers or null; no cumulative meter or utility keys are accepted. Missing grouped components require a null grouped result. Imported period rows cannot overlap within a factory. The original workbook bytes supply sourceSha256; the importer computes a canonical manifest checksum independently. Keep the manifest in an ignored private location such as .vercel/history.local.json.

## Apply procedure

1. Inspect the workbook and confirm the target account, environment and date scope. Prepare the private manifest and review blank rows, explicit missing values, date ranges and cached group totals.
2. Run the synthetic integration suite against development. Apply migration 002 explicitly using that environment’s maintenance connection. Never run synthetic integration tests in production. The additive migration leaves existing reports unchanged and grants the existing meter_app_runtime role SELECT only on the two new tables. New role setup includes those read grants.
3. Use the dry run below. It performs no data writes. Existing saved report overlaps are skipped. Identical imported periods are skipped; differing historical overlaps stop the entire import for review. Record counts and skipped dates are shown, never operational values or credentials.

```sh
node scripts/import-history.mjs --environment production --owner CONFIRMED_USERNAME --input .vercel/history.local.json
```

4. After reviewing the exact plan, use its planHash with --apply --expected-plan HASH. The plan is checked again under a transaction and owner lock. If relevant saved reports changed, the apply fails instead of using an old plan. The manifest and every inserted row commit together. Repeating the same manifest returns alreadyImported and writes nothing.
5. Verify source counts, target owner, saved-report preservation and the graph response. Keep workbook and manifest private. Import data is visible only after code containing the graph-history reader is deployed. Preparing/importing data does not itself deploy production.

consumption_imports records the source file checksum, canonical manifest checksum, owner, timestamp, imported count and skipped count. consumption_history stores the immutable values and exact worksheet row/range. These records document a maintenance import, not an authenticated operator report submission. Existing meter report/revision tables are not modified. Import manifests are not served by the website.

## Corrections and rollback

There is no silent upsert or overwrite. A differing repeat must be reviewed rather than applied. Saved reports take precedence in graph output if a later operator report overlaps imported history. A code rollback leaves historical import tables intact. Removing or replacing an applied import is a separate maintenance task requiring an explicit user request and exact batch/owner verification; never delete other account records.
