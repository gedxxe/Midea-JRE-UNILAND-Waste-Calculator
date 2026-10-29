import { t } from '../i18n/index.js';
import { sameWorkspace } from '../storage.js';
import { panelIcon } from './panel-icons.js';

// React Bits FuseButton outline/face interaction adapted to a deferred checkpoint.
// David Haz, MIT + Commons Clause: asset/licenses/react-bits.txt.
// The functional timer is independent of optional WAAPI and never reports early success.
export function createSaveFuse(button, { context, commit }) {
  const idle = document.createElement('span');
  idle.className = 'fuse-face fuse-idle';
  idle.append(...button.childNodes);
  const undo = document.createElement('span');
  undo.className = 'fuse-face fuse-undo';
  const undoLabel = document.createElement('span');
  const seconds = document.createElement('span');
  seconds.className = 'fuse-seconds';
  seconds.setAttribute('aria-hidden', 'true');
  undo.append(panelIcon('clock'), undoLabel, seconds);
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
  const status = document.createElement('span');
  status.id = 'save-version-status';
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  button.setAttribute('aria-describedby', status.id);
  button.classList.add('fuse-button');
  button.replaceChildren(idle, undo, svg);
  button.after(status);
  let phase = 'idle',
    captured,
    timer,
    animation,
    resetTimer;
  let remaining = 4000,
    started = null,
    hovering = false,
    canHoverPause = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motion = () =>
    !reduced.matches &&
    document.getElementById('application-surface').dataset.panelMotion !== 'off';
  const matches = () => captured && sameWorkspace(captured, context());
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
    animation?.cancel();
    animation = undefined;
  };
  function label() {
    const idleLabel = idle.querySelector('[data-i18n]');
    idleLabel.dataset.i18n = phase === 'saving' ? 'saveVersionSending' : 'saveReport';
    idleLabel.textContent = t(idleLabel.dataset.i18n);
    idle.setAttribute('aria-hidden', String(phase === 'armed'));
    undo.setAttribute('aria-hidden', String(phase !== 'armed'));
    undoLabel.textContent = t('undoSave');
    seconds.textContent = Math.max(1, Math.ceil(remaining / 1000)) + 's';
    button.dataset.fusePhase = phase;
  }
  function reset() {
    clear();
    clearTimeout(resetTimer);
    phase = 'idle';
    captured = undefined;
    label();
    button.removeAttribute('aria-busy');
    status.textContent = '';
  }
  function cancel(reason = 'undo') {
    if (phase !== 'armed') return;
    reset();
    status.textContent = t(
      reason === 'context' ? 'saveVersionContextChanged' : 'saveVersionCancelled',
    );
  }
  function visual() {
    animation?.cancel();
    animation = undefined;
    if (phase !== 'armed' || !motion() || !rim.animate) return;
    try {
      animation = rim.animate(
        [{ strokeDashoffset: -(1 - remaining / 4000) }, { strokeDashoffset: -1 }],
        { duration: remaining, fill: 'forwards', easing: 'linear' },
      );
      if (document.hidden || hovering) animation.pause();
    } catch {
      /* The timer and Undo remain usable without animation. */
    }
  }
  async function finish() {
    if (!matches()) {
      cancel('context');
      return;
    }
    clear();
    phase = 'saving';
    label();
    status.textContent = t('saveVersionSending');
    button.setAttribute('aria-busy', 'true');
    let saved = false;
    try {
      saved = !!(await commit(() => matches()));
    } catch {
      /* Account action owns errors and its localized feedback. */
    }
    if (phase !== 'saving') return;
    // An old account's completion must not decorate a new account's button.
    if (!matches()) {
      reset();
      status.textContent = '';
      return;
    }
    phase = 'idle';
    label();
    button.removeAttribute('aria-busy');
    if (saved) {
      button.dataset.fusePhase = 'saved';
      status.textContent = t('saveVersionConfirmed');
      resetTimer = setTimeout(() => {
        if (phase === 'idle') label();
      }, 2200);
    } else status.textContent = '';
    captured = undefined;
  }
  function tick() {
    clearTimeout(timer);
    if (phase !== 'armed') return;
    if (!matches()) {
      cancel('context');
      return;
    }
    const now = performance.now();
    if (started !== null) remaining = Math.max(0, remaining - (now - started));
    started = !document.hidden && !hovering ? now : null;
    label();
    if (remaining <= 0) {
      void finish();
      return;
    }
    // No polling while hidden. Visibility changes resume the remaining Undo window.
    if (!document.hidden) timer = setTimeout(tick, Math.min(100, remaining));
  }
  function sync() {
    if (phase === 'armed') {
      if (button.disabled) {
        cancel('unavailable');
        return;
      }
      tick();
      visual();
    }
  }
  button.addEventListener('click', (event) => {
    if (phase === 'armed') {
      cancel();
      return;
    }
    if (phase !== 'idle' || button.disabled) return;
    captured = structuredClone(context());
    if (!captured) return;
    clearTimeout(resetTimer);
    remaining = 4000;
    hovering = false;
    canHoverPause = false;
    started = performance.now();
    phase = 'armed';
    button.dataset.fuseInstant = String(event.detail === 0 || !motion());
    status.textContent = t('saveVersionPending');
    label();
    visual();
    tick();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && phase === 'armed') {
      event.preventDefault();
      cancel();
    }
  });
  button.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'mouse' || phase !== 'armed') return;
    tick();
    canHoverPause = true;
    hovering = false;
    started = document.hidden ? null : performance.now();
    visual();
  });
  button.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse' || phase !== 'armed' || !canHoverPause) return;
    tick();
    hovering = true;
    started = null;
    visual();
  });
  document.addEventListener('visibilitychange', sync);
  for (const type of ['input', 'change', 'click'])
    document.addEventListener(type, () => {
      if (phase === 'armed')
        queueMicrotask(() => {
          if (!matches()) cancel('context');
        });
    });
  new MutationObserver(() => {
    if (phase === 'armed' && !matches()) cancel('context');
    label();
    visual();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  reduced.addEventListener('change', visual);
  new MutationObserver(visual).observe(document.getElementById('application-surface'), {
    attributes: true,
    attributeFilter: ['data-panel-motion'],
  });
  label();
  return { sync, cancel, reset };
}
