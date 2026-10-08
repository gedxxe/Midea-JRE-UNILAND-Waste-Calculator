# Security and performance checks

This is an internet-accessible reporting application used internally. Public source code does not grant access to private reports, but the login screen alone is not an access control. Every account API must enforce the session, account state and record ownership on the server. Factory equipment names, client-side formulas and blank templates are intentionally public static assets. Making the repository private would not hide assets served before sign-in; stricter confidentiality requires a separate access policy. This document is not a certification or a full penetration test.

## Release checks

- `npm run verify`, direct builds and the Vercel build run a secret guard for tracked and non-ignored workspace files. It rejects private environment/key files, selected Neon/GitHub credential patterns, literal AUTH_SECRET assignments and remote PostgreSQL URLs containing passwords. Diagnostics contain paths and rule names only. Local test URLs and reserved example hosts are allowed. This is deliberately limited; arbitrary passwords, encoded secrets and all provider tokens are not detectable by these rules.
- GitHub secret scanning and push protection complement this guard. Do not bypass a genuine finding. Revoke/rotate an exposed credential first; removing it from the latest file does not invalidate it or remove Git history. Never paste secrets into issues, PRs, screenshots or chats.
- CI runs `npm run security:audit` after installing the exact lockfile. High/critical advisories or failure to contact the audit service block the gate. A clean result means no known advisories returned at that time, not proof of safe dependencies. Weekly Dependabot PRs cover npm and Actions; no automatic merge is configured.
- API tests use synthetic accounts and development/test PostgreSQL. They exercise ownership, session revocation, forged account headers, cross-origin writes, invalid request bodies, SQL-shaped inputs, limits and redacted errors. Browser tests cover account isolation, draft recovery and desktop/mobile flows. Never run these tests against production.
- Keep the public-file allowlist and asset-size budget. Environment files, database code and tests must not enter the static build.

## Current boundaries

Passwords use salted Argon2id. Session cookies are HttpOnly, SameSite=Strict and Secure/host-only over HTTPS. Origin checks protect JSON mutations; SQL values are parameterized; report ownership comes from the server session. Login throttling is shared through PostgreSQL, and authenticated mutations have per-user limits. Responses containing account data use private, no-store. API logs contain fixed metadata rather than raw requests or database errors.

Graph requests select only the immutable saved report and worksheet text needed for graph extraction. They do not fetch cumulative readings, gas observations or unused calculation fields from the snapshot. This reduces database-to-function bytes without recalculating history or changing chart values. It does not establish a production latency SLA; network and database wake-up time still contribute.

## Operational work outside this code review

- Confirm restricted runtime database grants, separate environments, and that privileged maintenance credentials never reach Vercel runtime or browser assets.
- If a credential has been shared outside its intended secret store, confirm rotation with the owner. A source scan cannot prove revocation.
- Verify Neon backup retention and practice restoration into a separate database. A Git tag rolls back code, not lost data.
- Review who can access GitHub, Vercel and Neon; protect those administrator accounts with MFA. Application accounts currently use passwords without MFA.
- Review production access logs and rate-limit behavior. Application throttling does not by itself cover distributed denial of service or every authenticated read. Network restrictions/WAF rules require an explicit access policy and testing so factory operators are not locked out.
- Keep security reports private and omit credentials and operational readings. A broader penetration test needs a defined target/environment, test accounts, rate limits and recovery plan. This review does not run brute-force, load or destructive tests against production.

References: [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [GitHub secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning), [GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection).

## Repository settings verified on 2026-10-08

GitHub secret scanning and push protection were enabled, with no open secret alerts. Main required the Quality gate, up-to-date PRs and admin enforcement, with force pushes and deletion disabled. Dependency alerts and automated security-fix PRs were disabled; this review enabled both and read back the enabled state. No open dependency alerts were returned at that check. Weekly version updates take effect after the Dependabot configuration is merged. These settings can change independently of Git commits.
