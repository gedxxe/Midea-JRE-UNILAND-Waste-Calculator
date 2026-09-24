# Accounts and historian

## Configuration

The static calculator remains usable without database configuration. Account APIs fail closed when configuration or PostgreSQL is unavailable. Never infer that a build or a logged-in UI proves database access.

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
- SELECT, INSERT, UPDATE on users and reports.
- SELECT, INSERT, UPDATE, DELETE on sessions and rate_limits.
- SELECT, INSERT on report_revisions and audit_events.

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
