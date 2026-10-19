# Quick guide

The signed-in Account panel has a Quick guide button. A small invitation appears until the account dismisses or opens it in this browser; it never opens a modal automatically. Eight topics cover periods, electricity entry, optional text import, daily gas/Water, drafts/recovery, raw versus calculated exports, historian and graphs.

The popup has decorative synthetic illustrations with a moving cursor and click pulse. It does not locate, click or modify real controls, read workspace data or send API requests. Manual Back/Next, Close/Escape and Finish keep the operator in control. Native dialog semantics plus keyboard wrapping contain focus; navigation focuses the heading and closing returns to the launcher. Reporting save/check shortcuts are suppressed inside the dialog. Account changes close it and invalidate pending opens.

Pause applies across steps; hidden tabs pause animation. Reduced-motion settings remove cursor, pulse and entry animations. The panel scrolls on short screens without horizontal overflow. Guide text follows English, Simplified Chinese or Indonesian; report formatting is independent.

## Loading and storage

Only the small launcher and invitation strings load with the workspace. Guide code, detailed translations and CSS load on demand. No browser packages, images, network services, schema migrations or database writes are added. A failed load shows a retryable message without changing readings. Blocked preference storage still allows dismissal for the visit.

The bounded localStorage key midea_guide_seen_v1 contains at most 50 account UUIDs indicating dismissed invitations. It contains no username, readings, credentials, progress or session tokens, never leaves the browser and is not in workspace backups. Clearing browser storage can show the invitation again. This preference is not a server access-control mechanism.

## Development verification

- Browser tests use synthetic authenticated responses to exercise desktop/mobile layout, all steps, languages, focus, reduced motion, pause, account changes, load failure and reading preservation. No Neon account is needed for these tests.
- Actual development login/API/storage verification uses a disposable synthetic account in the isolated development database. Generate credentials privately, run against the restricted runtime connection and clean only that account's records afterward. See [accounts](accounts.md) and keep maintenance credentials local.
- Preview remains without application login configuration unless the owner explicitly enables development credentials. Never use Production DATABASE_URL to make a preview work. A preview build alone does not prove authenticated browser behavior.

Remove the launcher integration, guide public files and invitation markup through a revert PR to roll back this UI feature. Existing drafts, reports and database schema require no rollback migration. The browser preference is harmless when unused.
