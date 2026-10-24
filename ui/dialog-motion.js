// Optional GlassSurface cannot block native forms or template controls.
export function createLazyGlassSurface(element) {
  let alive = true,
    effect;
  element.classList.add('energy-glass');
  void import('./glass-surface.js')
    .then((module) => {
      if (alive) effect = module.createGlassSurface(element);
    })
    .catch(() => {});
  return {
    destroy() {
      alive = false;
      effect?.destroy();
      element.classList.remove('energy-glass');
    },
  };
}
// The raw-template owner controls animated close; native close remains immediate for external resets.
export function createDialogMotion(dialog, { enter }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let animation,
    token = 0,
    closing = false,
    decoration;
  const moving = () =>
    !reduced.matches &&
    !document.hidden &&
    document.getElementById('welcome-hero')?.dataset.motion !== 'off' &&
    document.getElementById('welcome-hero')?.dataset.paused !== 'true';
  function cancel() {
    token++;
    animation?.cancel();
    animation = undefined;
    delete dialog.dataset.motion;
  }
  function closed() {
    // A native close event may arrive after a same-task reopen.
    if (dialog.open) return;
    cancel();
    closing = false;
    dialog.inert = false;
    decoration?.destroy();
    decoration = undefined;
  }
  function finish() {
    cancel();
    if (closing && dialog.open) dialog.close();
  }
  function animate(frames, duration, done) {
    const epoch = ++token;
    try {
      animation = dialog.animate(frames, {
        duration,
        easing: 'cubic-bezier(.4,0,.2,1)',
        fill: 'both',
      });
      void animation.finished
        .catch(() => {})
        .then(() => {
          if (epoch === token) {
            cancel();
            done?.();
          }
        });
    } catch {
      cancel();
      done?.();
    }
  }
  function requestClose() {
    if (!dialog.open || closing) return;
    const current = getComputedStyle(dialog);
    const start = { opacity: current.opacity, transform: current.transform };
    cancel();
    closing = true;
    dialog.inert = true;
    if (!moving() || !dialog.animate) return finish();
    dialog.dataset.motion = 'closing';
    animate([start, { opacity: 0, transform: 'translateY(12px) scale(.98)' }], 220, () => {
      if (dialog.open) dialog.close();
    });
  }
  dialog.querySelector('[data-close-dialog]').addEventListener('click', requestClose);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    requestClose();
  });
  dialog.addEventListener('close', closed);
  reduced.addEventListener('change', () => {
    if (reduced.matches) finish();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finish();
  });
  new MutationObserver(() => {
    if (!moving()) finish();
  }).observe(document.getElementById('welcome-hero'), {
    attributes: true,
    attributeFilter: ['data-motion', 'data-paused'],
  });
  return {
    open() {
      cancel();
      closing = false;
      dialog.inert = false;
      if (!dialog.open) dialog.showModal();
      decoration ||= enter();
      if (!moving() || !dialog.animate) return;
      dialog.dataset.motion = 'opening';
      animate(
        [
          { opacity: 0, transform: 'translateY(16px) scale(.97)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        320,
      );
    },
  };
}
