export function initLogoIntro() {
  const scene = document.getElementById('logo-intro');
  const replay = document.getElementById('replay-logo');
  if (!scene?.getAnimations || !replay) return;
  replay.hidden = false;
  replay.addEventListener('click', () => {
    if (scene.dataset.motion !== 'on' || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    for (const animation of scene.getAnimations({ subtree: true })) {
      animation.currentTime = 0;
      animation.play();
    }
  });
}
