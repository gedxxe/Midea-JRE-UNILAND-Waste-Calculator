# Application navigation

v0.11.18-alpha adds fixed routes to the existing static application. No framework, database schema or report format changes are required.

| Path            | View                           |
| --------------- | ------------------------------ |
| /               | Welcome and sign-in            |
| /app            | Meter readings and reports     |
| /app/monitoring | Charts and monthly table       |
| /app/history    | Saved report history           |
| /app/accounts   | Account management, admin only |

The monitoring, history and account views retain their existing dialogs. URL navigation is a presentation layer over the current controllers, not a second copy of the workspace. Normal menu changes use the History API without document reloads. Closing a menu returns to its parent when this tab created the history entry; a directly opened dialog returns to /app. Escape still restores an expanded graph before closing its dialog. Small confirmations, import and guide dialogs do not create routes.

## Session and draft boundaries

Resolve /api/auth before opening a protected view. Signed-out and required-password-change states use /. A protected initial link is remembered in memory for the first successful sign-in/password change. Logout, account switches and expired sessions clear that pending destination. Operators requesting /app/accounts return to /app without requesting the admin API. API session, ownership and role checks remain authoritative; changing the address cannot grant access.

Same-document route changes do not replace drafts, change periods, or save report revisions. Refresh uses the existing owner-scoped draft recovery. Do not put account IDs, credentials, operational readings or snapshots in URLs or history.state. Browser history stores only a random navigation marker and fixed parent route; previous entries are rechecked against the current session after logout.

## Serving and privacy

routes.js defines exact paths. Vercel rewrites only those application paths to index.html; scripts/dev.mjs uses the same definitions. Unknown application paths, unknown API routes and private source files remain 404. Document assets, lazy guide CSS, build metadata and the production analytics loader use root-relative paths. Module imports remain relative to their own module files.

Analytics scope is unchanged: production-only, root pageviews only, at most one per document load. Application routes and menu events are excluded. Authenticated redirects may occur before the tracker observes the root; this release does not promise complete visit counts. No route telemetry or extra database work is added.

## Verification and rollback

Test authenticated direct loads and refresh, logged-out and required-password gates, admin denial, Back/Forward, close/Escape, delayed requests, language changes, account switches, draft recovery and public templates. Reuse the normal unit, API integration and desktop/mobile browser checks. Confirm real preview build identity, nested asset loading and NTP separately.

A normal revert restores URL-less navigation without changing stored reports or draft formats. Older deployments do not serve nested paths; users with a bookmarked nested URL must reopen the root after rollback. Existing code release refs remain immutable. Production follows the owner's PR merge; preview login stays unconfigured.
