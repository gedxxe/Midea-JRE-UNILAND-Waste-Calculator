// React Bits Lattice Loader orbit pattern; see signin-effects.css and third-party notices.
import { t } from '../i18n/index.js';
export function createSignInTransition({ moving }) {
  const overlay = document.getElementById('signin-transition');
  const lattice = overlay?.querySelector('.lattice-loader');
  const label = document.getElementById('signin-transition-label');
  if (!overlay || !lattice || !label) {
    const noop = () => {};
    return { activity: noop, finish: noop, reset: noop, sync: noop };
  }
  let state = 'idle',
    animation,
    epoch = 0,
    timer;
  function reset() {
    epoch++;
    clearTimeout(timer);
    animation?.cancel();
    animation = undefined;
    overlay.hidden = true;
    state = 'idle';
  }
  function activity(status) {
    if (status === 'error') {
      reset();
      return;
    }
    if (status === 'working') {
      reset();
      state = 'working';
      overlay.hidden = false;
      lattice.dataset.status = 'working';
      label.dataset.i18n = 'welcomeSigningIn';
      label.textContent = t('welcomeSigningIn');
      sync();
    } else if (status === 'done' && state === 'working') {
      state = 'done';
      lattice.dataset.status = 'done';
      label.dataset.i18n = 'welcomeOpening';
      label.textContent = t('welcomeOpening');
    }
  }
  function finish() {
    if (state !== 'done') {
      reset();
      return;
    }
    if (!moving() || document.hidden || !overlay.animate) {
      reset();
      return;
    }
    const token = ++epoch;
    try {
      animation = overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 380,
        easing: 'cubic-bezier(.22,1,.36,1)',
        fill: 'both',
      });
      void animation.finished
        .catch(() => {})
        .then(() => {
          if (epoch === token) reset();
        });
      timer = setTimeout(() => {
        if (epoch === token) reset();
      }, 700);
    } catch {
      reset();
    }
  }
  function sync() {
    overlay.dataset.paused = String(document.hidden || !moving());
    if (state === 'done' && (!moving() || document.hidden)) reset();
  }
  document.addEventListener('visibilitychange', sync);
  return { activity, finish, reset, sync };
}
