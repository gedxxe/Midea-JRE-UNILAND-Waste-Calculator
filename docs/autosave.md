# Autosave and checkpoints

## Operator behavior

All six factory/period drafts save incomplete electricity, gas, temperatures, refills, Water and notes. Structural validation still rejects malformed or oversized API payloads; an unfinished or invalid reading string within the documented input shape remains saved. Calculation checks still control report copying. Missing values stay gaps, never invented zeros.

A valid dated document with entered data gets a mutable period autosave, displayed as Revision 1 before its first manual checkpoint. Charts/monthly tables use the latest account-confirmed working snapshot. Invalid/absent dates remain durable in the active workspace and are not plotted. Entirely empty untouched defaults do not create history. Clearing an existing working document updates its available values to gaps. Example data is not automatically published as period history.

Save version first synchronizes the workspace and its pending periods, then creates an immutable checkpoint. First manual checkpoint is Revision 1. Further checkpoints increment only when normalized raw draft or calculated output differs from the latest checkpoint. Repeating an identical Save does not write a revision, alter its timestamp, or create an audit event. Engine-version metadata alone does not force a revision. Autosaves after a checkpoint keep its historical bytes intact.

Delete saved draft clears the active workspace only; autosaved period history and manual checkpoints remain. The next edit or manual Save recreates the active workspace with its current concurrency token.

## Storage and timing

- Immediate owner-scoped sessionStorage recovery is atomic with its sync token and departed-period journal. It survives reload, not guaranteed tab closure. A damaged recovery copy is held for explicit recovery instead of silently overwritten.
- Background sync waits 3 seconds idle, at most 15 seconds during continuous editing, with at least 5 seconds between attempts. One request is in flight per tab. Failed requests back off from 30 seconds to 5 minutes. No graph polling or per-keystroke database writes.
- Before dates move, the previous dated draft is queued. Each request batches up to eight departed periods plus the six active drafts; duplicates coalesce by owner/factory/mode/start/end dates. Times remain part of the content, matching existing report identity.
- Account drafts and period snapshots commit atomically under a short owner-row lock. Optimistic versions reject changed concurrent work. Identical lost-response retries are no-ops; different stale data conflicts. Operator choices remain explicit.
- Manual save and monitoring/history opening flush queued changes first. Monitoring refreshes after a confirmed snapshot change. Failed sync is shown; monitoring may still display the last confirmed server values.
- pagehide sends a best-effort keepalive only under 60 KB when no request/conflict is active. It is not evidence of persistence. Check the account-confirmed status before closing; crashes or lost connectivity can leave data only in this tab.
- Private owner-bound backup format 5 includes the departed-period journal, up to 2 MB. Legacy formats retain the 256 KB limit and do not discard an existing journal when it is absent from the old file. Backups omit sessions and report links and are not encrypted.

## Module boundaries

- draft-records.js owns period identity, entry detection, canonical content comparison and journal restoration.
- ui/drafts.js owns the per-account queue, coalescing, retry, recovery, conflict and checkpoint serialization.
- server/drafts.js atomically persists the account workspace and partial period snapshots; server/period-autosaves.js plans/writes only changed documents in batches.
- server/report-store.js owns immutable manual checkpoint creation/deduplication; server/report-history.js reads the working copy or an explicit checkpoint.
- server/graphs.js projects saved output text, not raw meter/gas input. Existing graph parsers extract only available values and keep stock gains distinct from consumption.

## Migration, rollback and limits

Apply checksum-tracked migration 007 with the maintenance connection before deploying this code. It adds period_autosaves and grants the existing runtime role SELECT/INSERT/UPDATE only. No existing readings, revisions or imported history are recalculated. New workspace/report markers reject older writers that would erase newer autosave state. Older code can read historical checkpoints but cannot safely edit adopted documents.

Before production migration: passing required CI, an up-to-date encrypted private backup, and explicit owner authorization for 007. Previous permissions for 004/005/006 do not cover it. Do not run migrations from builds, broaden preview authentication, or remove guards for rollback. Preserve the database and use a compatible release to resume editing after rollback; export a full private backup first.

Active draft writes retain the existing 180/account/15-minute budget, allowing at most 12 background attempts/minute per continuously edited tab. Multiple devices share that budget. A write uses rate checking, owner locking, one batch snapshot lookup, one changed-snapshot batch upsert and one workspace update; unchanged snapshots are not rewritten. Monitoring uses existing read budgets. This is a faster cadence with bounded additional database work, not zero workload or a durability guarantee.

The journal supports up to 1,024 period entries and requests up to 512 KB; batches target 480 KB. Normal daily use is far below these bounds. Very large offline journals need a private backup and confirmed sync before leaving. Remain alpha; credential rotation, administrator MFA and backup restoration still require operational verification.
