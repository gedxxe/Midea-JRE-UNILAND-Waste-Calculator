// Accept only same-origin paths supplied by Vercel, never arbitrary script URLs.
export function analyticsPaths(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { scriptSrc, viewEndpoint } = value;
  const path = /^\/(?:[A-Za-z0-9_-]+\/)+script\.js$/;
  if (typeof scriptSrc !== 'string' || !path.test(scriptSrc)) return null;
  if (viewEndpoint !== scriptSrc.slice(0, -'script.js'.length) + 'view') return null;
  return { scriptSrc, viewEndpoint };
}

// This site has one page. Do not pass query strings, fragments or custom events.
export function pageViewFilter(origin) {
  let sent = false;
  return (event) => {
    if (sent || event?.type !== 'pageview' || typeof event.url !== 'string') return null;
    try {
      const url = new URL(event.url);
      if (url.origin !== origin || !['/', '/index.html'].includes(url.pathname)) return null;
      sent = true;
      return { type: 'pageview', url: origin + '/' };
    } catch {
      return null;
    }
  };
}
