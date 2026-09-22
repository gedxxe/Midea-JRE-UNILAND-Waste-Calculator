# Data and security

Meter readings, utilities, drafts, and reports are calculated in the browser and are not uploaded. The browser requests same-origin static assets, build-info.json, and GET /api/time. The time endpoint queries two fixed NTP hosts; callers cannot supply a destination.

Drafts are written to localStorage only after Save draft. Anyone using the same browser profile can read them. Delete saved draft removes stored drafts; currently open values remain in page memory. The language preference is stored separately and contains no readings.

User text is rendered through textContent/value, not innerHTML. Content Security Policy restricts scripts, styles, images, and connections to the same origin. Vercel headers block framing and MIME sniffing. Build and local serving share an explicit public-file allowlist; server files, tests, and documentation are not public assets.

NTP packets are checked for source/request timestamps, mode, version, synchronization state, and sample quality. UDP NTP is not authenticated NTS. Do not use this clock for machine control or signed audit timestamps. Each refresh emits an allowlisted JSON diagnostic record without request contents, raw errors, meter data, or headers. Build metadata exposes the release version, commit, build time, source hash, and local-change status.

There are no API keys, accounts, analytics, or cloud credentials in the application runtime. GitHub CI uses read-only token permissions and pinned Actions. Vercel deployment uses the existing Git integration. Keep repository protection and deployment access appropriate for its owner; a public repository is not access control for factory information.

Report security problems privately through the repository owner's available contact or GitHub private vulnerability reporting if enabled. Include a minimal reproduction, and do not include unnecessary operational readings, tokens, or passwords.
