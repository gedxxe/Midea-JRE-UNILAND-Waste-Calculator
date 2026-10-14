# Web Analytics

Vercel Web Analytics counts production page views and aggregate visits. This is traffic analytics, not performance measurement, an operator audit log or proof that reports were saved.

## Integration

The site remains plain HTML and JavaScript. No React, browser npm package, database table or application API is added. The build inserts a separate asynchronous loader only when VERCEL=1 and VERCEL_ENV=production. Local, CI and preview builds have no tracker. The loader uses same-origin script and collection paths, preserving the existing CSP without inline JavaScript or remote origins.

Vercel's VERCEL_OBSERVABILITY_CLIENT_CONFIG supplies dynamic scriptSrc and viewEndpoint paths when available. Only these two validated paths enter HTML. Without that build variable, use the official SDK's /_vercel/insights/script.js and /_vercel/insights/view fallback. Invalid configuration disables analytics rather than loading another origin. Neither path is a credential.

## Data and workload

A beforeSend filter permits at most one pageview per page load, for the root page only. It removes the query string, fragment and extra event fields and rejects custom events and other paths. The module never reads account state, meter fields, reports, notes, drafts or browser storage. No edit, save or login event is emitted. The Vercel-managed tracker processes browser/device and visit metadata, including external referrers; see its privacy documentation. The site's no-referrer policy also applies to the script request. Do not add identifiers, operational values, identity attribution or custom events to this integration.

The nonzero cost is an asynchronous script download, its execution and a pageview request handled by Vercel. There are no new Neon queries, own API functions, timers or autosave writes. Blocking analytics or a failed script download must leave sign-in, input, copying and saving usable. Script bytes and timings depend on Vercel's current tracker and browser caching; this release does not promise a fixed size or a measured speed improvement.

Vercel applies the team's Web Analytics event allowance and pricing. Check the dashboard and current limits before changing plan or enabling a paid add-on. No paid upgrade is part of this change.

## Enable, verify and revert

Enable Web Analytics in the Vercel project dashboard before the next production deployment. Merge the tested PR through the existing CI/CD process. Then visit production with content blockers disabled if needed and confirm a successful same-origin script request and pageview POST containing only the root URL and vendor metadata. Confirm data appears in Analytics. Local mocked tests and a preview with analytics disabled cannot prove production intake or dashboard ingestion.

Set WEB_ANALYTICS=off in the production build environment and deploy through the normal release workflow to omit the loader. Alternatively set data-analytics="off" on the html element and release that change. Disable collection immediately in the Vercel dashboard if needed. A normal revert PR also removes the integration; database records and calculation rules are unchanged.

References: [HTML setup](https://vercel.com/docs/analytics/quickstart), [configuration and beforeSend](https://vercel.com/docs/analytics/package), [privacy](https://vercel.com/docs/analytics/privacy-policy), [pricing and limits](https://vercel.com/docs/analytics/limits-and-pricing), [official SDK fallback](https://github.com/vercel/analytics/blob/main/packages/web/src/utils.ts).
