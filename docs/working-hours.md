# Electricity periods and report contents

Both factories support three recording periods. 24 HOURS uses morning D to morning D+1; AFTER PRODUCTION uses morning D to evening D; NIGHT SHIFT uses evening D to morning D+1. Each report uses its start date. Default times are 08:00 and 17:00 WIB. Existing editable shift times remain available; different timestamps never share a reading. Combined multi-day daily periods retain their full period total and existing day-range title.

## Operator flow

1. Choose the factory and recording mode. Enter raw cumulative readings or import the selected column. Raw export needs only that column and its date/time; a completed consumption report is unnecessary.
2. Choose Report contents: 24 HOURS; 24 HOURS & AFTER PRODUCTION; 24 HOURS, AFTER PRODUCTION, & NIGHT SHIFT; AFTER PRODUCTION only; NIGHT SHIFT only. A single selection needs only that period complete. A bundle requires matching dates and actual shared observations in one 24-hour period. It never divides a multi-day total, estimates a missing evening or sums shift totals to replace the main-meter delta.
3. Preview and Copy report use the chosen contents. Copy combined applies the same choice to JRE and UNILAND and requires matching periods for both plants. Official copied headings remain English. Language switching does not change report bytes.
4. Gas and Water stay daily and appear once under 24 HOURS when included. After production and Night remain electricity only, including optional JRE T1–T4 notes. Raw electricity exports still exclude T1–T4 and utilities.
5. Save stores only the recording period being edited; unfinished entries remain drafts. Excel row also uses that period. A bundled clipboard report is not a new database record type. Save each completed period for historian and graphs.
6. Next day in the shift workspace moves the recorded next morning into the next After production start. Unknown readings remain empty; save completed periods first. Daily Next day remains independent for its electricity, gas and Water dates. Undo restores the full workspace.

## Shared readings and legacy data

The existing daily, workingHours and nightShifts drafts are retained. workingHours now displays as After production. Same-factory/date/time observations can fill unambiguous empty cells across the three modes. Explicit table edits, paste/import and confirmed replacements share only changed readings, including matching JRE T1–T4; they never copy inactive confirmations or daily utilities. Date/time edits preserve exact matching observations. Undated partials stay recoverable. Unavailable readings remain unavailable, not zero.

Legacy Daily and shift drafts may disagree. Keep their nonempty values, show a neutral notice, and block bundled copy until the operator corrects the intended cell. Single-period reports and raw export remain available if independently valid. A correction shares the selected value with matching cells; unrelated conflicting meters remain untouched. Source example markers and ratio warnings accompany reused observations. Old saved reports and imported graph history never change.

Backups and delayed autosave use the same account workspace and conflict token. No per-keystroke database writes or new services are added. Backup v3 includes all modes. Older backups preserve collections they omit; Day/Night conflicts are rejected as before. Daily/shift differences are retained for review after restore. No trial data expires automatically.

## Release and rollback

This release adds no SQL migration beyond the existing 005 prerequisite. Verify 004 and 005 are already applied before deploying Night support; builds never migrate. 005 separates report uniqueness by owner, plant, kind and date interval, so daily and Night with identical dates coexist. After production keeps workingHours IDs; Night keeps nightShift IDs. Time corrections revise the selected shift/date report. Historian and graphs retain separate filters and immutable saved values.

Use a revert PR or verified deployment rollback without dropping rows, rewriting snapshots or reversing 005. The database guard prevents older writers from omitting saved Night drafts. Older UI cannot edit Night and may refuse to sync a protected workspace. Preserve a full private backup and restore the newer code to resume. Explicit confirmed workspace deletion remains supported. Production merge is the owner's action. This is alpha; operational rotation, MFA and restore checks remain separate beta prerequisites.
