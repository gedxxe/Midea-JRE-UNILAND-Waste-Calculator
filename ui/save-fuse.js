import { t } from '../i18n/index.js';
import { sameWorkspace } from '../storage.js';

// React Bits FuseButton rim adapted to immediate, read-only save verification.
// David Haz, MIT + Commons Clause: asset/licenses/react-bits.txt.
export function createSaveFuse(button, { context, commit }) {
  const face = document.createElement('span');
  face.className = 'fuse-face fuse-idle';
  face.append(...button.childNodes);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('fuse-rim');
  svg.setAttribute('aria-hidden', 'true');
  const rim = document.createElementNS(svg.namespaceURI, 'rect');
  for (const [key, value] of Object.entries({
    x: '1',
    y: '1',
    width: 'calc(100% - 2px)',
    height: 'calc(100% - 2px)',
    rx: '21',
    pathLength: '1',
  }))
    rim.setAttribute(key, value);
  svg.append(rim);
  button.classList.add('fuse-button');
  button.replaceChildren(face, svg);
  const status = document.createElement('span');
  status.id = 'save-version-status';
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  button.setAttribute('aria-describedby', status.id);
  button.after(status);
  let phase = 'idle',
    captured,
    generation = 0,
    visible = true;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const matches = () => !!captured && sameWorkspace(captured, context());
  function render() {
    const label = face.querySelector('[data-i18n]');
    label.dataset.i18n = phase === 'saving' ? 'saveVersionSending' : 'saveReport';
    label.textContent = t(label.dataset.i18n);
    button.dataset.fusePhase = phase;
    button.dataset.saveMotion =
      phase === 'saving' &&
      visible &&
      !document.hidden &&
      !reduced.matches &&
      document.getElementById('application-surface').dataset.panelMotion !== 'off'
        ? 'on'
        : 'off';
  }
  function reset() {
    generation++;
    captured = undefined;
    phase = 'idle';
    button.removeAttribute('aria-busy');
    status.textContent = '';
    render();
  }
  function sync() {
    if (phase === 'saving' && !matches()) {
      reset();
      return;
    }
    render();
  }
  button.addEventListener('click', async () => {
    if (phase === 'saving' || button.disabled) return;
    captured = structuredClone(context());
    if (!captured) return;
    const identity = ++generation;
    phase = 'saving';
    button.setAttribute('aria-busy', 'true');
    status.textContent = t('saveVersionSending');
    render();
    let verified = false;
    try {
      verified = !!(await commit(() => identity === generation && matches()));
    } catch {
      /* Account actions own localized errors. */
    }
    if (identity !== generation) return;
    if (!matches()) {
      reset();
      return;
    }
    phase = 'idle';
    button.removeAttribute('aria-busy');
    status.textContent = verified ? t('saveVersionConfirmed') : '';
    captured = undefined;
    render();
  });
  document.addEventListener('visibilitychange', render);
  document.addEventListener('input', () => {
    if (phase === 'saving' && !matches()) reset();
    else if (phase === 'idle') status.textContent = '';
  });
  document.addEventListener('change', () => {
    if (phase === 'saving' && !matches()) reset();
  });
  reduced.addEventListener('change', render);
  new MutationObserver(render).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang'],
  });
  new MutationObserver(render).observe(document.getElementById('application-surface'), {
    attributes: true,
    attributeFilter: ['data-panel-motion'],
  });
  if (typeof IntersectionObserver !== 'undefined')
    new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting === true;
      render();
    }).observe(button);
  render();
  return { sync, reset, cancel: reset };
}
