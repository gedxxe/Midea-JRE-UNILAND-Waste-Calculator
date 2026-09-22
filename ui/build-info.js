import { $ } from './dom.js';
import { t } from '../i18n/index.js';

export async function showBuildInfo() {
  try {
    const response = await fetch('./build-info.json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Build metadata unavailable.');
    const info = await response.json();
    if (info.schemaVersion !== 1 || !/^\d+\.\d+\.\d+(?:-alpha)?$/.test(info.version))
      throw new Error('Invalid build metadata.');
    const commit = /^[a-f\d]{40}$/i.test(info.commit || '') ? info.commit.slice(0, 7) : 'unknown';
    $('app-version').textContent =
      `v${info.version} · ${commit}${info.dirty ? ' + local changes' : ''}`;
    $('build-info').textContent = JSON.stringify(info, null, 2);
  } catch {
    $('build-info').textContent = t('buildUnavailable');
  }
}
