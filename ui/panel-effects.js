// Optional presentation only. Canonical text updates synchronously even when an effect fails.
export function createPanelEffects() {
  const surface = document.getElementById('application-surface'),
    workspace = document.getElementById('report-workspace'),
    hero = document.getElementById('welcome-hero'),
    copy = document.getElementById('copy-report');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'),
    contrast = matchMedia('(forced-colors: active)');
  const records = new Map();
  let counterModule,
    counterLoading = false,
    counterFailed = false,
    specular,
    specularLoading = false,
    specularFailed = false,
    copyVisible = false,
    epoch = 0;
  const motion = () =>
    !document.hidden &&
    !reduced.matches &&
    !contrast.matches &&
    surface.dataset.panelMotion !== 'off' &&
    !document.querySelector('dialog[open]') &&
    (!document.body.classList.contains('login-page') ||
      (hero.dataset.motion !== 'off' && hero.dataset.paused !== 'true'));
  const shown = (element) => !element.closest('[hidden], [inert]');
  function bind(record) {
    if (record.effect || record.failed || !counterModule || !shown(record.element)) return;
    try {
      record.effect = counterModule.createCounter(record.element, {
        clock: record.element.id === 'clock-time',
        allowed: motion,
      });
      record.failed = !record.effect;
      record.effect?.update(record.text, record.scope);
    } catch {
      record.failed = true; /* Keep the canonical text and native layout. */
    }
  }
  function sync() {
    for (const record of records.values()) {
      bind(record);
      record.effect?.sync();
    }
    if (
      !counterModule &&
      !counterLoading &&
      !counterFailed &&
      [...records.values()].some((r) => shown(r.element)) &&
      motion()
    ) {
      counterLoading = true;
      void import('./counter.js')
        .then((module) => {
          counterModule = module;
          for (const record of records.values()) bind(record);
        })
        .catch(() => {
          counterFailed = true;
        })
        .finally(() => {
          counterLoading = false;
        });
    }
    if (workspace.hidden || surface.hidden || surface.inert) {
      specular?.destroy();
      specular = undefined;
    } else specular?.sync();
    if (
      !specular &&
      !specularLoading &&
      !specularFailed &&
      copyVisible &&
      !copy.disabled &&
      !workspace.hidden &&
      shown(copy) &&
      motion()
    ) {
      specularLoading = true;
      const token = epoch;
      void import('./signin-specular.js')
        .then((module) => {
          if (token === epoch && !workspace.hidden && shown(copy)) {
            specular = module.createSpecularButton(copy, () => motion() && !workspace.hidden, {
              radius: 14,
            });
            specularFailed = !specular;
          }
        })
        .catch(() => {
          specularFailed = true;
          /* CSS button and native clipboard remain usable. */
        })
        .finally(() => {
          specularLoading = false;
        });
    }
  }
  function setText(element, text, scope) {
    let record = records.get(element.id);
    if (!record) {
      record = { element };
      records.set(element.id, record);
    }
    record.text = text;
    record.scope = scope;
    // This is the sole text that assistive technology, selection and existing consumers read.
    if (record.effect) record.effect.update(text, scope);
    else {
      element.textContent = text;
      bind(record);
    }
    if (!counterModule && !counterLoading && shown(element)) sync();
  }
  const intersection =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          copyVisible = entries.some((e) => e.isIntersecting);
          sync();
        })
      : null;
  intersection?.observe(copy);
  if (!intersection) copyVisible = true;
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  contrast.addEventListener('change', sync);
  new MutationObserver(sync).observe(surface, {
    attributes: true,
    attributeFilter: ['data-panel-motion', 'hidden', 'inert'],
  });
  new MutationObserver(sync).observe(hero, {
    attributes: true,
    attributeFilter: ['data-motion', 'data-paused'],
  });
  new MutationObserver((records) => {
    if (records.some((r) => r.target.tagName === 'DIALOG')) sync();
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['open'] });
  return {
    setText,
    sync,
    reset() {
      epoch++;
      specularFailed = false;
      specular?.destroy();
      specular = undefined;
      for (const record of records.values())
        if (record.element.id !== 'clock-time') record.effect?.reset();
    },
  };
}
