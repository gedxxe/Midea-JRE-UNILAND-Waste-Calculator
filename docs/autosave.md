# Autosave and save verification

## Operator behavior

All six factory/period drafts save incomplete electricity, gas, temperatures, refills, Water and notes. Structural validation still rejects malformed or oversized API payloads; an unfinished or invalid reading string within the documented input shape remains saved. Calculation checks still control report copying. Missing values stay gaps, never invented zeros.

A valid dated document with entered data gets a mutable period autosave, displayed as Revision 1 when first created. Charts/monthly tables use the latest account-confirmed working snapshot. Invalid/absent dates remain durable in the active workspace and are not plotted. Entirely empty untouched defaults do not create history. Clearing an existing working document updates its available values to gaps. Example data is not automatically published as period history.

Save first synchronizes the workspace and pending periods, then reads the server workspace to verify version and content. Repeated checks create no checkpoint, report revision or redundant copy. A changed local copy during verification remains pending; a differing server copy is an explicit conflict. Legacy report/checkpoint APIs remain compatible for historical recovery, but the current Save button does not call them.

Delete saved draft clears the active workspace only; autosaved period history and manual checkpoints remain. The next edit or manual Save recreates the active workspace with its current concurrency token.

Save starts verification immediately. The earlier checkpoint delay and Undo faces are removed because this button creates no copy or revision. Its rim animates only while a real request is pending, stopping for hidden/offscreen/reduced-motion states. Edits or account/period changes invalidate the confirmation; autosave continues independently.

## Storage and timing

- Immediate owner-scoped sessionStorage recovery is atomic with its sync token and departed-period journal. It survives reload, not guaranteed tab closure. A damaged recovery copy is held for explicit recovery instead of silently overwritten.
- Background sync waits 3 seconds idle, at most 15 seconds during continuous editing, with at least 5 seconds between attempts. One request is in flight per tab. Failed requests back off from 30 seconds to 5 minutes. No graph polling or per-keystroke database writes.
- Before dates move, the previous dated draft is queued. Each request batches up to eight departed periods plus the six active drafts; duplicates coalesce by owner/factory/mode/start/end dates. Times remain part of the content, matching existing report identity.
- Account drafts and period snapshots commit atomically under a short owner-row lock. Optimistic versions reject changed concurrent work. Identical lost-response retries are no-ops; different stale data conflicts. A matching active workspace does not acknowledge queued periods: recovery retains their original token until the server verifies the entire batch. Operator choices remain explicit. Returning input to a previously acknowledged local value does not clear a conflict or mark it saved: the server may now contain another device's change. Keep local recovery pending until an explicit resolution. Recovery/deletion checks include queue edits made during a request; an unchanged manual response cannot advance their token past another device.
- Manual save and monitoring/history opening flush queued changes first. Monitoring refreshes after a confirmed snapshot change. Failed sync is shown; monitoring may still display the last confirmed server values.
- pagehide sends a best-effort keepalive only under 60 KB when no request/conflict is active. It is not evidence of persistence. Check the account-confirmed status before closing; crashes or lost connectivity can leave data only in this tab.
- Private owner-bound backup format 5 includes the departed-period journal, up to 2 MB. Legacy formats retain the 256 KB limit and do not discard an existing journal when it is absent from the old file. Backups omit sessions and report links and are not encrypted.

## Module boundaries

- draft-records.js owns period identity, entry detection, canonical content comparison and journal restoration.
- ui/save-fuse.js owns immediate verification feedback and the optional rim animation. It neither delays persistence nor creates/deletes checkpoints.
- ui/drafts.js owns the per-account queue, coalescing, retry, recovery, conflict handling, destination loading and save verification.
- server/drafts.js atomically persists the account workspace and partial period snapshots; server/period-autosaves.js plans/writes only changed documents in batches.
- server/report-store.js owns immutable manual checkpoint creation/deduplication; server/report-history.js reads the working copy or an explicit checkpoint.
- server/graphs.js projects saved output text, not raw meter/gas input. Existing graph parsers extract only available values and keep stock gains distinct from consumption.

## Migration, rollback and limits

The original autosave rollout required checksum-tracked migration 007 with the maintenance connection. This v0.11.35 change adds no migration. It adds period_autosaves and grants the existing runtime role SELECT/INSERT/UPDATE only. No existing readings, revisions or imported history are recalculated. New workspace/report markers reject older writers that would erase newer autosave state. Older code can read historical checkpoints but cannot safely edit adopted documents.

Any future production migration still requires passing CI, an up-to-date private backup and explicit owner authorization. Do not run migrations from builds, broaden preview authentication, or remove guards for rollback. Preserve the database and use a compatible release to resume editing after rollback; export a full private backup first.

Active draft writes retain the existing 180/account/15-minute budget, allowing at most 12 background attempts/minute per continuously edited tab. Multiple devices share that budget. A write uses rate checking, owner locking, one batch snapshot lookup, one changed-snapshot batch upsert and one workspace update; unchanged snapshots are not rewritten. Monitoring uses existing read budgets. This is a faster cadence with bounded additional database work, not zero workload or a durability guarantee.

The journal supports up to 1,024 period entries and requests up to 512 KB; batches target 480 KB. Normal daily use is far below these bounds. Very large offline journals need a private backup and confirmed sync before leaving. Remain alpha; credential rotation, administrator MFA and backup restoration still require operational verification.

Warehouse Lighting defaults before its recording date are excluded from the meaningful-input check. Opening an otherwise empty historical period therefore does not create a Revision 1 document or graph point. An actual zero entered on/after 2026-10-25 remains user data and autosaves normally. Other meter/utility zero handling is unchanged.

Queued JRE period writes must use the current meter layout before server normalization. An older tab receives DRAFT_FORMAT_CHANGED and must reload, even when its active workspace already has the current layout. Client-side backup/tab recovery can upgrade the old queue without discarding saved meter fields.

## Destination-period safety (v0.11.35-alpha)

Dates select the current document. Before installing a known daily destination, flush the departing work and read the destination under the current account. Briefly lock entry fields during navigation. The server rejects replacing an archived document without its observed version; existing workspace concurrency checks remain in force. A lost-response retry with identical content stays idempotent.

Offline navigation keeps partial input and departed periods in owner-bound tab recovery. Deferred loading preserves unedited stored fields; an edit conflicting with unseen stored data stops as an explicit conflict. Navigation metadata is stored atomically with recovery. Historian restoration is an explicit user action, distinct from an unloaded blank field.

Manual Save verifies the same canonical autosaved document without creating an extra checkpoint. The redundant Save draft control and graph source selector are removed. Monitoring reads the current autosaved documents. No production repair is implicit in this release.
