# Security and performance checks

This is an internet-accessible reporting application used internally. Public source code does not grant access to private reports, but the login screen alone is not an access control. Every account API must enforce the session, account state and record ownership on the server. Factory equipment names, client-side formulas and blank templates are intentionally public static assets. Making the repository private would not hide assets served before sign-in; stricter confidentiality requires a separate access policy. This document is not a certification or a full penetration test.

## Release checks

- `npm run verify` runs a secret guard for tracked and non-ignored workspace files. Direct builds and Vercel use `npm run security:build` against the explicit runtime file list without relying on Git metadata. Missing runtime files fail the build. It rejects private environment/key files, selected Neon/GitHub credential patterns, literal AUTH_SECRET assignments and remote PostgreSQL URLs containing passwords. Diagnostics contain paths and rule names only. Local test URLs and reserved example hosts are allowed. This is deliberately limited; arbitrary passwords, encoded secrets and all provider tokens are not detectable by these rules.
- GitHub secret scanning and push protection complement this guard. Do not bypass a genuine finding. Revoke/rotate an exposed credential first; removing it from the latest file does not invalidate it or remove Git history. Never paste secrets into issues, PRs, screenshots or chats.
- CI runs `npm run security:audit` after installing the exact lockfile. High/critical advisories or failure to contact the audit service block the gate. A clean result means no known advisories returned at that time, not proof of safe dependencies. Weekly Dependabot PRs cover npm and Actions; no automatic merge is configured.
- API tests use synthetic accounts and development/test PostgreSQL. They exercise ownership, session revocation, forged account headers, cross-origin writes, invalid request bodies, SQL-shaped inputs, limits and redacted errors. Additional cases persist hostile note text, discard prototype/owner fields, reject duplicate cookies, and enforce login limits across separate handler instances and canonical username variants. Browser tests verify that stored notes, historian text and graph titles remain inert, including exported SVG, and reject encoded static-path traversal. Never run these tests against production.
- Keep the public-file allowlist and asset-size budget. Environment files, database code and tests must not enter the static build.

## Web Analytics

Production page views use a separate same-origin Vercel tracker. The filter removes URL query strings and fragments, rejects other paths/custom events and never reads account or operational state. Vercel still processes visit metadata. Keep the existing CSP; do not add remote script origins or identity attribution. Analytics failures must not block reporting. See [collection and disable controls](analytics.md).

## Current boundaries

Passwords use salted Argon2id. Session cookies are HttpOnly, SameSite=Strict and Secure/host-only over HTTPS. Origin checks protect JSON mutations; SQL values are parameterized; report ownership comes from the server session. Login throttling is shared through PostgreSQL, and authenticated mutations have per-user limits. Responses containing account data use private, no-store. API logs contain fixed metadata rather than raw requests or database errors.

Report/draft/admin GET requests now share 600 requests per verified account per 15-minute fixed window. Graph GET requests have a separate budget of 120. Limits use the existing HMAC-keyed PostgreSQL counter across handlers and devices. A graph budget cannot exhaust draft read/write budgets; read exhaustion does not prevent an otherwise valid draft write. Every protected read adds a counter query after authentication and before querying private content. 429 responses remain no-store with Retry-After. Session lookup, counter updates and rejected function calls still cost work; fixed windows permit bursts around a boundary. This reduces authenticated resource abuse, not distributed denial of service.

Graph requests select only the immutable saved report and worksheet text needed for graph extraction. They do not fetch cumulative readings, gas observations or unused calculation fields from the snapshot. This reduces database-to-function bytes without recalculating history or changing chart values. It does not establish a production latency SLA; network and database wake-up time still contribute.

## Operational work outside this code review

- Confirm restricted runtime database grants, separate environments, and that privileged maintenance credentials never reach Vercel runtime or browser assets.
- If a credential has been shared outside its intended secret store, confirm rotation with the owner. A source scan cannot prove revocation.
- Verify Neon backup retention and practice restoration into a separate database. A Git tag rolls back code, not lost data.
- Review who can access GitHub, Vercel and Neon; protect those administrator accounts with MFA. Application accounts currently use passwords without MFA.
- Review production access logs and rate-limit behavior. Application throttling does not by itself cover distributed denial of service or every authenticated read. Network restrictions/WAF rules require an explicit access policy and testing so factory operators are not locked out.
- Monitor rate-limit keys, audit events, report revisions and sessions. There is no scheduled retention process; expired sessions for an account are removed at login. Set retention requirements before adding automatic deletion. Per-process connection limits are not global serverless connection limits.
- Keep security reports private and omit credentials and operational readings. A broader penetration test needs a defined target/environment, test accounts, rate limits and recovery plan. This review does not run brute-force, load or destructive tests against production.

References: [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [GitHub secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning), [GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection).

## Repository settings verified on 2026-10-08

GitHub secret scanning and push protection were enabled, with no open secret alerts. Main required the Quality gate, up-to-date PRs and admin enforcement, with force pushes and deletion disabled. Dependency alerts and automated security-fix PRs were disabled; this review enabled both and read back the enabled state. No open dependency alerts were returned at that check. Weekly version updates take effect after the Dependabot configuration is merged. These settings can change independently of Git commits.

## Release readiness

Passing targeted security tests is necessary evidence, not a complete penetration test or beta approval. Before a beta decision, verify credential rotation, administrator MFA and a backup restoration exercise; use only a separate restore target. Keep detailed operational findings local and out of public issues. UI and security-test improvements may continue as alpha releases while these checks are incomplete.

## Review on 2026-10-16 (v0.11.3-alpha)

Scope: browser rendering/export, JSON/backup validation, API authorization, SQL/TLS and role boundaries, session invalidation, resource consumption, build exposure, dependency advisories, Git history secret-pattern checks and CI/release configuration. Active injection and account tests use synthetic development data. Production checks were unauthenticated read-only requests, not brute-force, load, exploit-chain or destructive tests. This is a code/configuration review with targeted tests, not an independent full penetration test.

| Finding                                                              | Action / status                                                                                                                                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated content reads had no budget                            | Added shared account limits before content queries; graph and editing budgets are separate. Tests cover cross-handler sharing, account isolation, window reset and draft-write availability. |
| SECURITY.md said analytics was absent and omitted draft upload       | Corrected the disclosure to include debounced draft sync and production-only aggregate analytics, with links to controls.                                                                    |
| README mixed release history with operation and had stale row counts | Reorganized operator/developer guidance, architecture and current limits. Release history remains in CHANGELOG.                                                                              |
| Credential rotation, administrator MFA and restoration exercise      | Still unverified by the owner. No beta approval; source scans and tests cannot establish these.                                                                                              |
| Capacity, retention and perimeter policy                             | No production load test or SLA; no automatic retention. Application limits do not replace a tested platform/network policy. See [feasibility and capacity](architecture.md).                 |

Production reads at review time reported v0.11.2-alpha, commit 588d19e. Unauthenticated report/draft/user/graph endpoints returned 401 and private no-store responses without permissive CORS headers. Representative environment, Git, server, migration, dependency and Vercel-local paths returned 404. The root returned same-origin CSP with frame-ancestors none, HSTS, nosniff, no-referrer and restricted device permissions. These observations do not prove authenticated behavior or future deployment state.

The selected-pattern scanner checked 804 reachable historical blobs and found no matches. GitHub settings were read back: secret scanning and push protection enabled, zero open secret/dependency alerts, strict Quality gate on main, admin enforcement, force-push/deletion disabled. A clean scan is limited to its patterns and current alerts. It cannot prove a previously disclosed credential was revoked, that all kinds of secrets are absent, or that administrators use MFA.

No production database changes, credential rotation, firewall policy changes or backup restoration were performed. Keep any broader test evidence private and agree targets/accounts, rates and recovery before live testing.

Local evidence: npm run verify passed 155 unit tests and the build/format/source checks; dependency audit returned zero known vulnerabilities. The 23 integration tests used a separate development database and restricted runtime role. A synthetic browser-to-API-to-database flow verified login, server-calculated report persistence, historian output and confirmed logout/session revocation with no browser errors; its temporary records were removed. The targeted desktop/mobile template and hostile-text/static-exposure checks passed. Full CI remains the required release gate; these results are not a production load or recovery test.

## v0.11.23 autosave

Latest account-confirmed partial period snapshots now feed monitoring, with missing values kept as gaps. Manual checkpoints remain immutable and identical saves do not add revisions. See [autosave design, limits and migration 007](autosave.md). Production needs an updated private backup and explicit approval before migration.

## 2026-10-25 welcome timing review

Scope: cold-start title rendering, optional-effect loading, forward/reverse sign-in presentation and late callbacks after authentication. Two UI regressions were reproduced before the fix: visible fallback text before animation readiness, and a Back control whose late layout moved the form. Independent effect completion now avoids holding the title behind a stalled background; a three-second title-import fallback cannot restart the intro after a late response.

Reviewed the unchanged session/auth-version, account-header, password-change and role guards; exact-origin JSON mutations; owner-scoped parameterized draft/graph reads; and private no-store/redacted errors. Presentation callbacks check the current account/stage, do not fetch private records and do not weaken those server checks. The same-origin CSP and public-file allowlist remain unchanged.

Local verification passed the secret/build/format checks and 220 unit tests; 68 welcome/sign-in desktop/mobile cases; and six late-callback, hostile stored-text/SVG and sensitive/encoded static-path cases. Dependency audit returned zero known advisories at review time. The database-backed authorization/injection suite remains a required CI gate using disposable PostgreSQL, never production. No new security issue was reproduced within this scope; this is not an independent penetration test or proof against every attack. Credential rotation, platform-admin MFA and restore readiness still require the owner's operational verification.

## 2026-10-27 autosave conflict audit

Reproduced a false saved state after a server conflict: restoring an older locally acknowledged value cleared the pending recovery flag even though another device had newer server data. The unchanged-value shortcut now retains conflicts, pending local recovery and explicit resolution, including reload. This changes no calculation, authentication, API, database, request budget or sync interval.

Unauthenticated read-only checks observed production v0.11.26-alpha at merge commit 8975688. Account drafts, reports and graphs returned 401 with private no-store responses; the sampled server-source and environment paths returned 404. The public NTP endpoint returned protocol NTP from time.cloudflare.com. These observations cover those requests only, not authenticated production behavior or a security certification. Tests use synthetic local data and disposable CI PostgreSQL; no production writes, brute force or load tests. Credential rotation, platform administrator MFA and backup restoration remain operational checks for the owner.
