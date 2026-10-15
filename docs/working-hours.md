# Working-hours electricity trial

Requested 2026-10-14 for JRE and UNILAND: record after-work readings for a one-week trial and calculate morning-to-evening usage only. Default times are 08:00 and 17:00 WIB. This is v0.10.0-alpha, not a beta decision.

## Operator flow

1. Keep the existing Daily workspace for morning-to-next-morning electricity, gas and Water.
2. Select Working hours and the factory. Enter the work date and actual morning/evening reading times on that date.
3. Enter both cumulative columns. The matching daily 08:00 column may be copied explicitly; no historian readings are invented or fetched automatically. Existing morning entries require confirmation before replacement.
4. Review consumption and copy the working-hours report. Its title identifies actual times. Save retains owner-private raw readings, times and immutable revision output. Incomplete data remains an autosaved draft.
5. Historian and Graphs have separate mode filters. Graphs use the saved working-hours totals, not daily or overnight consumption. Choose the trial's date range; every recorded work date remains visible.
6. Next day creates an empty morning/evening pair. Preserve the previous day's report first. It does not turn a 17:00 observation into an 08:00 one.

Time/date changes keep exact matching observations and clear unknown endpoints. Undo restores the previous period. Blank work templates include a time placeholder. Filled raw import/export requires one Reading time: HH:MM WIB line. T1–T4 remain JRE-only optional notes; their exclusions remain unchanged. Gas/Water belong to Daily mode.

One account workspace stores all four drafts, using the existing delayed replaceable autosave and conflict checks. Full JSON backups include both modes. Legacy backups preserve current work drafts. Reports do not expire when the trial week ends; no automatic data deletion is scheduled.

## Release and rollback

Run all local checks, development integration and desktop/mobile browser tests before publishing the PR. CI repeats these against synthetic PostgreSQL data. Apply migration 004 explicitly using the maintenance connection in development and production before merging. No new environment variables or runtime grants are needed. Build/deploy never migrates.

Migration 004 adds report_kind with daily as default, keeps historical snapshots untouched, and permits same-date work endpoints. Daily reports retain next-date endpoints. Revisions continue per owner/factory/date interval; correcting work times revises that work-date report. Work mode supports one interval per factory/date, not multiple shifts.

Normal rollback uses a revert PR or a verified Vercel rollback, without rewriting Git or dropping tables. The database retains trial reports and a trigger prevents older code from overwriting a saved workspace while omitting its workingHours collection. The older UI cannot manage work reports and may show a save-service error when this protection applies. Download a full backup before rollback, pause draft editing in old clients, and restore the newer code to resume the trial. Explicit draft deletion remains a confirmed action. Do not remove the trigger or trial data to resolve an old-client error.

Read back actual CI and deployment state, inspect build-info.json and /api/time, and verify real account storage separately from mocked browser tests. Production merge remains the owner's action. Credential rotation, administrator MFA and backup restoration still need operational verification before any beta release.

UNILAND layout 4 includes SV window, Painting and Dryer in both modes. Import accepts optional (Pagi)/(Sore) date labels; absent a Reading time line, it uses the selected column time. An explicit time still overrides that column. Labels alone do not choose or guess a time. Review the destination selector before applying.
