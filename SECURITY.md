# Data and security

The public calculator processes readings in the browser. Saving a report while signed in uploads the current factory to the same-origin API, which validates and recalculates it before storing it in PostgreSQL. Login submits credentials over HTTPS in deployment. No analytics or third-party browser SDK is included.

Reports belong to immutable user IDs. Every report API checks its verified session and ownership; knowing a report ID or changing a request field does not grant access. Admins manage operator accounts but do not gain access to their private reports. Report updates require the observed revision and append an immutable snapshot through one database transaction.

Passwords use salted Argon2id (19 MiB, two iterations, one lane). Passwords must have 15–128 characters. Initial and reset passwords are random, temporary, and require replacement before using historian APIs. Sessions use random 256-bit tokens; only SHA-256 token hashes are stored. Cookies are HttpOnly and SameSite=Strict, with Secure and a __Host- prefix on HTTPS. Expiry is eight hours. Password changes/resets and disabling accounts invalidate existing sessions.

Mutations require application/json and the configured exact Origin; cross-site fetches are rejected. A per-account request header also prevents stale tabs from silently sending one account's readings under another account's newly active session. This header is an account-consistency check, not authentication. Rate limits are stored in PostgreSQL so serverless instances share them; usernames and IP identifiers are HMAC-hashed with AUTH_SECRET.

Guest drafts remain in localStorage on the same browser profile. Signed-in drafts use sessionStorage keyed by user ID and are cleared on detected logout/account changes. These browser stores are not encrypted or an OS-level privacy boundary. Use separate browser/OS profiles on shared machines. A lost network connection can delay detection of a server-side reset; APIs still enforce session revocation. Active accounts never automatically upload legacy guest drafts.

Use a restricted PostgreSQL role for the API and separate privileged credentials for migration/recovery. Keep development/preview and production databases separate. DATABASE_URL, AUTH_SECRET, temporary-password files, and database dumps must not be committed or exposed in browser assets. Rotate a credential if it was pasted into a public issue, chat, screenshot, or log.

The static build uses an explicit public-file allowlist. Server code, SQL migrations, tests, and environment files are not public assets. User-controlled strings use textContent/value. Content Security Policy permits only same-origin scripts, styles, images, connections, and form submissions; Vercel headers prevent framing and MIME sniffing.

API logs contain a request ID and fixed status/code fields, never request bodies, cookies, passwords, raw exceptions, SQL, or readings. Database audit events record account actions and report saves. Build metadata exposes version, commit, build time, source hash, and local-change status.

NTP is UDP, not authenticated NTS, and must not be used as a machine-control or trusted audit clock. Database write times come from the server. NTP failures remain visible. Browser tests mock NTP and do not establish live synchronization.

CI uses pinned Actions with read-only token permissions and a disposable PostgreSQL service with synthetic data. Vercel uses the existing Git integration. Secret configuration, database grants, backups, restore drills, and deployment access require actual platform setup; repository files alone do not apply these controls.

Report security problems privately to the repository owner or through GitHub private vulnerability reporting when enabled. Include a minimal reproduction without operational readings or credentials.
