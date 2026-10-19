# Architecture and operating scope

[Back to README](../README.md)

## One record from entry to review

The optional [Quick guide](guide.md) is isolated from this data flow. Its decorative cursor illustrations, styles and long translations load on demand. It changes only a bounded browser invitation preference, never workspace data or database records.

1. The signed-in operator chooses a factory and daily, After production or Night period. The table stores cumulative reading strings, not precomputed totals. Exact factory/date/time identifies shared electricity observations. The language selection changes interface messages, not copied report bytes.
2. Pure modules validate numbers, periods, factors, gas calibration and water readings. Empty readings stay incomplete. Explicit unavailable values retain their check notes. The browser shows individual usage and equipment totals before the operator saves.
3. Incomplete work goes to a tab recovery copy and one replaceable account workspace. Debounced autosave sends an expected version. The API checks the session, owner, payload and version in a transaction; conflicting writers cannot silently replace one another.
4. A completed report sends raw inputs, not authoritative client totals. The API restores the allowed draft shape and recalculates with the same pure modules. A new report revision contains the original output and engine version. Reads always use the verified session owner.
5. Historian returns that saved output. Graphs parse only the latest saved report/worksheet text plus approved consumption history. They do not recalculate historical snapshots with new meter rules. A raw export instead validates one selected reading column independently of report completion.

## Module map

| Boundary            | Main modules                                                         | Responsibility                                                          |
| ------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Equipment and math  | schema.js, engine.js, numbers.js, worksheet.js                       | Fixed factors, exact scaled subtraction, totals, official output        |
| Periods and layout  | reading-period.js, observations.js, shifts.js, meter-layout.js       | Exact-time reuse, Day/Night pairing, explicit legacy layout upgrades    |
| Gas and Water       | gas.js, gas-tables.js, uniland-gas-tables.js, water.js               | Plant calibration, interpolation, refill correction, cumulative Water   |
| Operator interface  | app.js, ui/table.js, ui/gas.js, ui/water.js, i18n/                   | State coordination, readable forms and translated messages              |
| Recovery and import | storage.js, draft-backup.js, importer.js, ui/drafts.js               | Validated restore, atomic import, debounced sync and conflict choices   |
| Accounts and HTTP   | server/auth.js, auth-handlers.js, password.js, http.js               | Sessions, Argon2id, origin/body checks, rate limits, redacted errors    |
| Persistence         | server/db.js, drafts.js, reports.js, report-data.js                  | TLS PostgreSQL, parameterized queries, owner checks and transactions    |
| Graphs and export   | server/graphs.js, graph-data.js, ui/graph-renderer.js, raw-export.js | Immutable history extraction, SVG/PNG/clipboard, blank/filled raw lists |
| Time and build      | server/ntp.js, clock.js, scripts/assets.mjs, scripts/build.mjs       | Fixed NTP servers, visible failure, static allowlist and build identity |

Business modules have no DOM, storage or network dependencies. Browser modules have no runtime package dependencies. There is no React/Next.js framework or AI service. Server dependencies are pg and @node-rs/argon2; development tools are Playwright and Prettier.

## Deployment and trust boundaries

Vercel serves the allowlisted static build and six Node API routes. Neon PostgreSQL holds accounts, hashed sessions, shared rate counters, replaceable drafts, immutable report revisions, audit events and approved history imports. Remote database connections verify TLS certificates. Restricted runtime grants limit operations but do not provide row-level isolation: application owner checks are essential. Privileged credentials are reserved for explicit local maintenance.

The login screen hides the workspace but is not the security boundary. Equipment schemas, formulas, calibration modules and blank templates are served publicly. Password/session/API controls protect account data. To classify even the schema or calibration as confidential would require a separate deployment access policy and a review of the public repository.

Production analytics is an isolated asynchronous root-page tracker without access to application state or storage. It is absent in preview/local builds. README badges and docs images are never part of the public application file list.

## Capacity and feasibility

| Constraint           | Current behavior and implication                                                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request sizes        | Report/auth JSON is bounded at 64 KiB; draft JSON at 256 KiB. Larger requests fail instead of silently truncating.                                                                                                                                                                      |
| Authenticated reads  | Report/draft/admin reads share 600 requests/account/15-minute fixed window. Graphs use a separate 120 budget. Counters are shared in PostgreSQL, not process memory. Rejected requests return 429 with Retry-After. One counter query is added per accepted authenticated read attempt. |
| Writes               | Existing login, password, draft, report and admin budgets stay separate. Autosave waits 30 seconds idle or 120 seconds continuous editing; it creates no report revisions.                                                                                                              |
| Database connections | Up to three connections per warm process with connection/statement timeouts; aggregate serverless concurrency can create more. Monitor Neon connections and pooling rather than treating three as a global cap.                                                                         |
| Graph size           | One request spans at most 365 date differences and 1000 combined saved/imported records. Null data stays missing. Large client-rendered exports still use browser memory.                                                                                                               |
| Time endpoint        | Fixed NTP destinations, one in-flight refresh per warm process, 60-second successful sample reuse and 10-second failure backoff. Not a fleet-wide throttle and not authenticated NTS.                                                                                                   |
| Retention            | Report revisions, audit events and rate-limit keys have no automatic retention job. Expired sessions for an account are removed at login. Monitor growth; approve retention rules before deleting history or adding a recurring job.                                                    |
| Availability         | Browser entry/math does not require a database query per keystroke. Login, account storage and historian need the API/database. Download templates and private backups ahead of outages. This is not an offline PWA or a control system.                                                |

This architecture is suitable for continued small-team alpha use while costs, database growth, concurrency and recovery are observed. No production load test or latency/availability SLA has been established. Read limits reduce repeated work by a signed-in account but still require a session lookup and counter query; they cannot stop distributed traffic before function invocation. Platform WAF/network policy is separate work requiring operator access requirements.

## CI/CD and recovery

GitHub's required Quality gate tests the lockfile, selected secret patterns, known dependency advisories, pure calculations, actual handlers with synthetic PostgreSQL data, build allowlist and Chromium desktop/mobile flows. Official Actions are SHA-pinned with read-only workflow permissions. PRs use preview deployments; owner-approved merges to main use Vercel's existing Git integration. Builds never migrate databases.

An immutable release branch/tag preserves tested code. A revert PR preserves Git history. Neither restores deleted database content or verifies that backups can be restored. New layouts reject stale saves; old code may not edit newer drafts. Keep a private full workspace backup and follow [release/rollback](releases.md) and [account recovery](accounts.md).

## Contribution to daily improvement work

Standard input templates reduce re-entry differences. Visible component checks help operators review mistakes. Saved revisions explain corrections without rewriting history. Consistent periods and chart groups support management review of energy trends. These are reporting aids for Midea employees; they do not establish official MBS compliance, efficiency savings, certified measurement or a Toyota system affiliation. Managers still choose the review process and validate conclusions.
