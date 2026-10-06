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

## Production and preview

Set the same variable names with separate values in Vercel environments. Preview and Development use a development database; Production uses production. Use different AUTH_SECRET values. Run production migrations and bootstrap explicitly against the production database before enabling accounts. Do not run migrations inside Vercel builds or on every request.

The site already uses Vercel's Git integration. Push a feature branch for preview, inspect the deployment and /api/auth, and complete a real login/save/reopen test. Production changes only after an authorized PR merge. Vercel deployment protection may require the owner to sign in.

## Data and sessions

Each report is owned by an immutable user UUID. Ownership is checked for every list, read, and update. The client account header detects a browser tab using the wrong current session; it does not grant identity. There is no shared factory historian in this release. Admins manage accounts but cannot read other users' reports through the application.

A report is unique per owner, factory, start date, and end date. Saving requires valid, complete readings under the existing engine rules; explicit unavailable readings and warnings remain allowed. Raw decimal strings, calculated English output, and engine version are saved together in a JSON snapshot. Each correction appends a revision in the same transaction that advances the current revision. Optimistic revision checks prevent silent overwrites.

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

One active workspace per account contains both factories and their report-edit references. Drafts are structurally validated but may have empty or unfinished readings. They live in working_drafts, not reports/report_revisions, and do not feed graphs. Its version is only a concurrency token; updates replace the row and do not append revisions. Clearing leaves a null workspace with an advanced token so a stale tab cannot recreate a deleted draft silently. Reads and writes always derive ownership from the session; runtime has no DELETE grant.

Each edit first replaces an account-scoped sessionStorage backup. Remote autosave waits for 30 seconds idle or 120 seconds continuous editing, with at least 30 seconds between automatic writes. Unchanged edits do not resubmit; the API also treats identical retries as no-ops. Failed requests retry with backoff up to five minutes, with a visible status and explicit retry action. A tab-local backup survives reload, not closing the tab; pending sync prompts before leaving. Offline data must finish syncing before closing or signing out to retain it in the account.

On reopening, a clean local copy loads the account draft. Unsynced local edits are retained. Conflicting copies pause autosave until the operator chooses Load saved draft or Keep this draft after confirmation. Identity changes clear local recovery and discard late responses. Save draft always stores the workspace; Save stores incomplete current-factory data as a draft or submits a complete report through the existing revision workflow. Draft storage never finalizes a report automatically. Report references retain optimistic revision checks when a saved draft resumes on another device.

Apply migration 003 with the maintenance connection before deploying this release; no additional Vercel environment variables are required for production. Code rollback preserves the draft row; older code does not synchronize it.

Reading dates identify observations. Changing the period maps existing electricity and gas observations to matching dates and leaves unknown dates empty; it never loads or invents historian readings. Consecutive date edits retain the original endpoints in memory so either field can be changed first. Undo restores the period before that sequence. Other edits, factory/account changes and reload discard that temporary reference; only the current workspace is autosaved. Period utilities, refill events and inactive confirmations reset for a different period. Import text uses the selected column as an editable template; partial templates remain invalid until completed, and failed imports never change the table. Pending text is separate per column while the dialog is open and discarded when it closes.

Version-4 JRE drafts may now include meterLayout: 2 and optional water start/end strings. Legacy meter arrays are mapped into the current layout on editable-copy restore; raw water data survives draft and report storage. Loading a historical report maps an editable copy but preserves its saved English output. No SQL migration is needed. Existing clients with the old JRE layout can still save a recoverable draft, but completed report saves require reloading and reviewing the new grouping.
