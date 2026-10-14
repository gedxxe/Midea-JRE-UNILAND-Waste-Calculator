import { analyticsPaths, pageViewFilter } from '../analytics.js';

function startAnalytics() {
  if (document.documentElement.dataset.analytics === 'off' || location.protocol !== 'https:')
    return;
  if (document.querySelector('script[data-app-analytics]')) return;
  let paths;
  try {
    paths = analyticsPaths(
      JSON.parse(document.querySelector('meta[name="app-analytics"]')?.content),
    );
  } catch {
    return;
  }
  if (!paths) return;
  window.va =
    window.va ||
    function (...args) {
      (window.vaq = window.vaq || []).push(args);
    };
  window.va('beforeSend', pageViewFilter(location.origin));
  const script = document.createElement('script');
  script.src = paths.scriptSrc;
  script.dataset.viewEndpoint = paths.viewEndpoint;
  script.dataset.appAnalytics = '1';
  script.defer = true;
  script.async = true;
  script.fetchPriority = 'low';
  script.referrerPolicy = 'no-referrer';
  // A blocked or unavailable tracker never interrupts the reporting workspace.
  script.onerror = () => script.remove();
  document.head.appendChild(script);
}

startAnalytics();
