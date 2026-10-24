# Accounts and historian

## Configuration

The opening screen requires sign-in before showing the reading workspace. A required initial password change also keeps the workspace hidden. Without database configuration, show an account-service error and a retry action; there is no guest entry mode. Existing guest drafts remain preserved in localStorage. This screen transition does not replace server-side authentication or report ownership checks. Account APIs fail closed when configuration or PostgreSQL is unavailable. Never infer that a build or a logged-in UI proves database access.

- DATABASE_URL: runtime PostgreSQL connection, preferably Neon pooled.
- AUTH_SECRET: at least 32 cryptographically random characters, used to hash persistent rate-limit identifiers.
- APP_ORIGIN: exact origin accepted for JSON mutations. Local example: http://127.0.0.1:3000. Production must be explicit. For Vercel previews, omit this value to use https://VERCEL_URL for that deployment. A custom preview alias needs its exact origin.
- DATABASE_MIGRATION_URL: optional privileged URL used only by scripts/database.mjs. Do not deploy it to the website.
- TEST_DATABASE_URL: separate connection for integration tests. Never use production.

Local scripts load .env.local. Existing process environment variables take precedence. Browser test servers explicitly skip local secrets. Keep .env.local and *.local.txt ignored by Git.

## Initial development setup

1. Create a Neon development branch separately from production. Before the database contains real readings, branching from an empty production branch is sufficient. Later previews should use synthetic data or a schema-only copy, not copies of operational data.
2. Enter development DATABASE_URL, AUTH_SECRET, and local APP_ORIGIN in .env.local.
3. Run npm ci, npm run db:check, then npm run db:migrate -- --apply.
4. Run npm run admin:create -- power-engineer. Read the generated .admin-setup.local.txt locally. Log in, change the temporary password, then delete the file.
5. Use the account panel to create operators. Their temporary password appears once in the admin dialog and is cleared when the dialog closes. Deliver it privately.

The bootstrap command refuses to create a second admin or overwrite a credentials file. Do not commit or upload that file. On a shared workstation, use a private OS profile and appropriate file permissions.

## Runtime database role

Migrations/bootstrap use a privileged database connection. For the API, create a dedicated login role and grant only:

- USAGE on schema meter_app.
- SELECT, INSERT, UPDATE on users, reports and working_drafts (migration 003).
- SELECT, INSERT, UPDATE, DELETE on sessions and rate_limits.
- SELECT, INSERT on report_revisions and audit_events.
- SELECT only on consumption_history and consumption_imports after migration 002. Maintenance imports use a separate privileged connection; no web import or runtime write grant is added.

For local setup, node scripts/runtime-role.mjs --apply creates this role, verifies its grants, and updates .env.local: DATABASE_URL becomes the restricted connection and DATABASE_MIGRATION_URL retains the maintenance connection. It refuses to overwrite an existing role or existing separated credentials. Run it separately for each environment using that environment’s local credentials.

No schema creation, role administration, report deletion, or revision update/delete is needed by the API. Keep the privileged connection out of Vercel runtime variables. PostgreSQL credentials grant capabilities independently of web-app account roles.

## Shift utility compatibility

Migration 006 preserves existing records and extends protection against older writers: newer shift utility drafts require utilityLayout 1, and older report revisions cannot replace records created with that format. New API code rejects stale shift-report payloads with METER_LAYOUT_CHANGED. Apply 006 explicitly with the maintenance connection after a verified private backup; never through a build or the runtime connection. Production migration requires the owner's applicable authorization. A code rollback retains data but old UI cannot edit protected drafts/reports; use a compatible version to resume. Backup v5 includes all shift utilities and remains owner-bound.

## Production and preview

Set the same variable names with separate values in Vercel environments. Preview and Development use a development database; Production uses production. Use different AUTH_SECRET values. Run production migrations and bootstrap explicitly against the production database before enabling accounts. Do not run migrations inside Vercel builds or on every request.

The site already uses Vercel's Git integration. Push a feature branch for preview, inspect the deployment and /api/auth, and complete a real login/save/reopen test. Production changes only after an authorized PR merge. Vercel deployment protection may require the owner to sign in.

## Data and sessions

Each report is owned by an immutable user UUID. Ownership is checked for every list, read, and update. The client account header detects a browser tab using the wrong current session; it does not grant identity. There is no shared factory historian in this release. Admins manage accounts but cannot read other users' reports through the application.

A report is unique per owner, factory, kind, start date, and end date. Saving requires valid, complete readings under the existing engine rules; explicit unavailable readings and warnings remain allowed. Raw decimal strings, calculated English output, and engine version are saved together in a JSON snapshot. Each correction appends a revision in the same transaction that advances the current revision. Optimistic revision checks prevent silent overwrites.

The stored output remains available even if future calculation rules change. Loading historical readings into the editor recalculates with the currently deployed engine. The old saved output is not changed. Saving older readings creates a new revision against the latest revision observed when opening them.

Sessions use random tokens in HttpOnly, SameSite=Strict cookies. HTTPS adds Secure and the __Host- prefix. Only token hashes are stored in PostgreSQL. Sessions expire after eight hours. Password reset/change and account disable revoke prior sessions. There is no remember-me or email recovery flow.

Login limits apply per IP and canonical username, stored in PostgreSQL across serverless instances. Account/report mutations have per-user limits. Old rate-limit and session rows can be removed with node scripts/database.mjs cleanup. Run it as routine maintenance; it never deletes reports.

## Recovery and rollback

For admin recovery, remove or securely archive the old local credentials file first, then run:

```sh
node scripts/database.mjs reset-admin power-engineer --apply
```

This generates a temporary password, requires a change on next login, and revokes all admin sessions. It requires privileged database access, not a public HTTP endpoint.

Migrations run in one transaction with an advisory lock and a recorded SHA-256 checksum. Re-running an applied migration is a no-op; editing its contents causes an error. Add a new migration rather than rewriting an applied one.

Rolling back to v0.2.0-alpha disables the account UI/APIs but leaves database records intact. Do not delete schema or revise migration history to roll back the site. Choose backward-compatible schema changes, back up before migrations, and practice restoring to a separate database. This repository does not configure a backup schedule or retention policy for your Neon plan.

## Checks

Unit tests cover password hashing, cookie/origin policy, and server calculation. Integration tests use real PostgreSQL and HTTP requests for ownership, temporary passwords, revocation, rate limiting, immutable revisions, and concurrent updates. Browser tests cover login, account draft isolation, language switching, historical output, and logout on desktop/mobile.

Runtime API error logs contain request IDs and fixed codes only. They omit bodies, cookies, passwords, connection strings, SQL, and readings. Audit tables record report revisions and account-management actions; they are not a certified or tamper-proof audit system.

## Working draft autosave

One active workspace per account contains both factories and their report-edit references. Drafts are structurally validated but may have empty or unfinished readings. The active workspace lives in working_drafts; dated working copies in period_autosaves feed graphs without manual Save. Immutable manual checkpoints remain in reports/report_revisions. Its version is only a concurrency token; updates replace the row and do not append revisions. Clearing leaves a null workspace with an advanced token so a stale tab cannot recreate a deleted draft silently. Reads and writes always derive ownership from the session; runtime has no DELETE grant.

Each edit first replaces an account-scoped sessionStorage backup. Remote autosave waits for 3 seconds idle or 15 seconds continuous editing, with at least 5 seconds between background attempts. Unchanged edits do not resubmit; the API also treats identical retries as no-ops. Failed requests retry with backoff up to five minutes, with a visible status and explicit retry action. A tab-local backup survives reload, not closing the tab; pending sync prompts before leaving. Offline data must finish syncing before closing or signing out to retain it in the account.

The tab workspace and its local save/version metadata are stored in one atomic value. A storage failure cannot pair newer readings with an older saved flag. The optional tabRecovery field is local only: it is stripped from server payloads and portable backups. Legacy two-key copies remain readable but are treated as potentially unsynced until compared with the server; differing newer server versions require the existing explicit conflict choice. Storage may still reject the entire write, so check the tab/account save messages before reloading or closing. Keep a private JSON backup before rolling back to an older client that cannot read the embedded metadata.

If a save committed but its response was lost, recovery accepts an identical server copy even when PostgreSQL reorders object keys. Reading strings, array order and missing or added fields remain significant; a real difference with a newer server version still requires conflict resolution.

On reopening, a clean local copy loads the account draft. Unsynced local edits are retained. Conflicting copies pause autosave until the operator chooses Load saved draft or Keep this draft after confirmation. Identity changes clear local recovery and discard late responses. Save draft always stores the workspace; Save version creates an immutable checkpoint even when the current dated document is incomplete. It increments only when content differs. Autosave never increments that manual checkpoint counter. Report references retain optimistic revision checks when a saved draft resumes on another device.

Apply migration 003 with the maintenance connection before deploying this release; no additional Vercel environment variables are required for production. Code rollback preserves the draft row; older code does not synchronize it.

Reading dates identify observations. Changing the period maps existing electricity and gas observations to matching dates and leaves unknown dates empty; it never loads or invents historian readings. Consecutive date edits retain the original endpoints in memory so either field can be changed first. Undo restores the period before that sequence. Other edits, factory/account changes and reload discard that temporary reference; only the current workspace is autosaved. Period utilities, refill events and inactive confirmations reset for a different period. Import text uses the selected column as an editable template; partial templates remain invalid until completed, and failed imports never change the table. Pending text is separate per column while the dialog is open and discarded when it closes.

Version-4 drafts use the current meterLayout (JRE 5, UNILAND 4) and optional water start/end strings. Legacy arrays are mapped into the current layout on editable-copy restore, with new meter slots blank. Raw water data survives draft and report storage. Loading a historical report upgrades an editable copy while preserving its saved English output. Completed report saves require the current layout; once an expanded workspace is stored, stale layout writers are rejected instead of erasing new slots. This client recovery change needs no new SQL migration.

## Draft recovery files and save times

The draft API returns database updated_at on reads, writes and unchanged saves. An unchanged write retains its original timestamp. The UI never invents a server save time from a device clock or a failed response; tab-copy timestamps are separate and reset on identity changes. These times describe draft storage, not report finalization.

Private JSON backup files contain validated version-4 drafts for both plants and owner UUID, including partial raw observations. They omit account credentials, session state and reportLinks. Restore rejects unsupported, malformed, over-2-MB (legacy formats: 256 KB) or foreign-owner files before mutation; account changes and edits during file reading invalidate the pending operation. Confirmation replaces both local drafts, clears report revision links, and makes one workspace Undo available. Normal delayed autosave and optimistic conflicts still apply; importing never writes report history. Do not commit backup files or share operating data publicly.

## Electricity recording periods

Migration 004 adds workingHours (Day). Migration 005 adds nightShift and makes reports unique per owner, plant, kind and date endpoints. Daily and Night can share endpoints without collision. Day ends on its start date; Night ends the following date. Actual reading times are preserved in the snapshot. Correcting times revises the same shift/date report. All reads and writes remain owner-scoped.

The replaceable workspace stores daily drafts, workingHours and nightShifts for both factories. JREWork/UNILANDWork and JRENight/UNILANDNight keep separate revision references. The existing autosave cadence and optimistic version token apply to the whole workspace. API and database trigger reject older writers that omit a saved shift collection. Explicit confirmed workspace deletion remains supported. Private backup v5 includes all six drafts and shift utilities; legacy backups retain missing collections, reject conflicting After production/Night readings before replacement, and clear revision links. See [shift workflow and rollback](working-hours.md).

The five report-content choices affect preview and clipboard only. Save still stores the selected recording period, using daily, workingHours (After production) or nightShift. Shared electricity, gas stock/temperature and Water corrections remain raw draft data. Manual utility totals, untimed refills, tank selections and per-period inactive confirmations stay independent. Legacy Daily/shift differences are preserved for operator review, not silently reconciled by a report calculation. No new migration is introduced by v0.11.1-alpha.

## Latest period autosaves

See [autosave storage, checkpoint rules, migration and rollback](autosave.md). Migration 007 must precede v0.11.23 deployment. Runtime can SELECT/INSERT/UPDATE period_autosaves; it cannot delete history. Production requires its own backup and explicit migration approval.
