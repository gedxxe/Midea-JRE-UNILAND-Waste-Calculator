import { t } from '../i18n/index.js';

export function initLogoIntro() {
  const scene = document.getElementById('logo-intro');
  const replay = document.getElementById('replay-logo');
  const pause = document.getElementById('pause-logo');
  if (!scene?.getAnimations || !replay || !pause) return;
  replay.hidden = false;
  pause.hidden = false;
  function syncPlayback() {
    for (const animation of scene.getAnimations({ subtree: true })) {
      if (document.hidden || scene.dataset.paused === 'true') animation.pause();
      else animation.play();
    }
  }
  function setPaused(value) {
    scene.dataset.paused = String(value);
    const key = value ? 'resumeLogo' : 'pauseLogo';
    pause.dataset.i18nAriaLabel = key;
    pause.dataset.i18nTitle = key;
    pause.setAttribute('aria-label', t(key));
    pause.title = t(key);
    pause.setAttribute('aria-pressed', String(value));
    pause.firstElementChild.textContent = value ? '▶' : 'Ⅱ';
    syncPlayback();
  }
  pause.addEventListener('click', () => setPaused(scene.dataset.paused !== 'true'));
  const visibility = () => {
    scene.dataset.suspended = String(document.hidden);
    syncPlayback();
  };
  document.addEventListener('visibilitychange', visibility);
  visibility();
  replay.addEventListener('click', () => {
    if (scene.dataset.motion !== 'on' || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    setPaused(false);
    for (const animation of scene.getAnimations({ subtree: true })) {
      animation.currentTime = 0;
      animation.play();
    }
  });
}
