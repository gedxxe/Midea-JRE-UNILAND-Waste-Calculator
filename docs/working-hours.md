# Day and Night electricity

v0.11.0-alpha supersedes the original morning-to-evening-only trial. Both factories now have Day and Night reports. Gas and Water stay daily. Existing saved outputs and revisions are never recalculated.

## Operator flow

1. Choose Day for morning D to evening D, or Night for evening D to morning D+1. The shift date is D in both cases. Defaults are 08:00 and 17:00 WIB; enter actual times when needed. The column headers show complete dates and times.
2. Enter cumulative electricity readings. Day end and Night start share a reading only when their date and time match. Editing either updates the other, including optional JRE T1–T4. Inactive confirmations belong to each report and are not shared.
3. Copy Day or Copy Night independently. Copy Day + Night needs two complete, matching shifts and produces one factory/date with separate Day and Night sections. It never sums or averages them. Existing Copy combined still combines JRE + UNILAND in the selected mode.
4. Save report saves the selected shift only. Save incomplete input as a draft. Save both completed shifts before Next day: this replaces the active pair with the next date, carries the recorded next morning into the following Day start, and leaves unknown evening/following-morning cells empty. Undo restores the full workspace.
5. Daily remains available for morning-to-next-morning electricity, gas and Water. Its readings are independent. Use matching 08:00 daily reading is an explicit Day action, with confirmation before replacing a filled column. No historian totals become raw readings.
6. Historian and Graphs filter Daily, Day or Night. Graphs read immutable saved results, retain actual timestamps and never combine utilities with shift electricity. Each shift date is a single point.

Time/date edits move only matching timestamps. Shared cells remain one observation; a 17:00 reading is never relabelled 08:00. Untimed raw import uses the selected column time. Optional Pagi/Sore/Morning/Afternoon/Day shift/Night shift date labels are descriptive only. Explicit Reading time overrides the selected time. For Night end imports, the reading date is the next morning, so the shift date becomes the preceding day.

## Drafts and recovery

The owner workspace has Daily drafts, workingHours (Day) and nightShifts (Night) collections for both factories. It uses the existing delayed replaceable autosave, optimistic version token and cross-tab conflict choices. No database write occurs per keystroke. Backup v3 includes all six drafts and incomplete observations without sessions or report revision links. Older backups retain collections they omit. If restored shared values disagree, reject the entire replacement; missing shared cells can be filled from their matching counterpart. No reports or trial data expire automatically.

## Release and rollback

Apply migration 005 explicitly to development and production before merging. Migration 004 is a prerequisite. Builds never migrate. No new environment variables, services or runtime grants are needed.

005 permits nightShift periods ending the following date and separates report uniqueness by owner, plant, kind and date interval, so Daily and Night with identical dates coexist. Day retains the existing workingHours database kind and IDs. Editing actual reading times creates a revision of that shift/date report. There is one Day and one Night report per factory/date.

The draft trigger rejects older writers that omit a saved Night collection. Existing daily/Day code works against the expanded schema, but old UI cannot edit Night and may refuse to sync a protected workspace. Download a full private backup before rollback, pause editing in old clients, and restore newer code to resume. Use a revert PR or a verified deployment rollback; never drop shift rows, rewrite snapshots or reverse 005 to hide errors. Explicit confirmed draft deletion remains supported.

Production migration 005 requires its own reviewed approval; authorization for 004 does not cover it. Publish a draft PR until 005 is applied. Check actual CI, preview build metadata and /api/time. Production merge remains the owner's action. This release remains alpha; operational credential rotation, MFA and backup restoration are still separate prerequisites for beta.
