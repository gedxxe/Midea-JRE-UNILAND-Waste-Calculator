import { $ } from './dom.js';
import { t } from '../i18n/index.js';
let started = false;
export async function showBuildInfo() {
  const packed = document.querySelector('meta[name="app-build"]')?.content;
  let loaded;
  try {
    loaded = packed ? JSON.parse(packed) : null;
  } catch {
    loaded = null;
  }
  function display(info) {
    if (info?.schemaVersion !== 1 || !/^\d+\.\d+\.\d+(?:-alpha)?$/.test(info.version))
      throw new Error('Invalid build metadata');
    const commit = /^[a-f\d]{40}$/i.test(info.commit || '') ? info.commit.slice(0, 7) : 'unknown';
    $('app-version').textContent =
      'v' + info.version + ' · ' + commit + (info.dirty ? ' + local changes' : '');
    $('build-info').textContent = JSON.stringify(info, null, 2);
  }
  try {
    if (loaded) display(loaded);
  } catch {
    loaded = null;
  }
  async function check() {
    try {
      const response = await fetch('./build-info.json', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Build metadata unavailable');
      const latest = await response.json();
      if (!loaded) display(latest);
      else if (
        latest.schemaVersion === 1 &&
        latest.sourceHash &&
        latest.sourceHash !== loaded.sourceHash
      ) {
        $('update-notice').textContent = t('updateAvailable');
        $('update-notice').hidden = false;
      }
    } catch {
      if (!loaded) $('build-info').textContent = t('buildUnavailable');
    }
  }
  await check();
  if (!started) {
    started = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void check();
    });
    setInterval(() => {
      if (!document.hidden) void check();
    }, 60000);
  }
}
