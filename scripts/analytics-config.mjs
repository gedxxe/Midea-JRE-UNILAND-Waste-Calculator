import { analyticsPaths } from '../analytics.js';

export function analyticsBuildConfig(env) {
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production' || env.WEB_ANALYTICS === 'off')
    return null;
  if (env.VERCEL_OBSERVABILITY_CLIENT_CONFIG) {
    try {
      return analyticsPaths(JSON.parse(env.VERCEL_OBSERVABILITY_CLIENT_CONFIG)?.analytics);
    } catch {
      return null;
    }
  }
  // Official HTML/SDK fallback when Vercel does not supply dynamic intake paths.
  return analyticsPaths({
    scriptSrc: '/_vercel/insights/script.js',
    viewEndpoint: '/_vercel/insights/view',
  });
}

export function analyticsMarkup(config) {
  const paths = analyticsPaths(config);
  if (!paths) return '';
  const content = JSON.stringify(paths).replaceAll('"', '&quot;');
  return (
    '<meta name="app-analytics" content="' +
    content +
    '" />\n<script type="module" src="./ui/analytics.js"></script>\n'
  );
}
