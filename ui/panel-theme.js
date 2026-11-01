// Presentation only: no readings, account identity, storage or network access.
export function createPanelTheme() {
  const root = document.documentElement,
    body = document.body,
    surface = document.getElementById('application-surface'),
    picker = document.getElementById('reading-mode');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'),
    forced = matchMedia('(forced-colors: active)');
  let target = false,
    selected = false,
    sequence = 0,
    origin,
    transition,
    cancelledTransition,
    deadline,
    animation;
  const shown = () => !body.classList.contains('login-page') && !surface.hidden;
  const apply = () => {
    body.toggleAttribute('data-night-panel', target && shown() && !forced.matches);
  };
  function stop() {
    sequence++;
    clearTimeout(deadline);
    animation?.cancel();
    animation = undefined;
    const old = transition;
    transition = undefined;
    if (old) {
      // Hide the captured view immediately, including while a skipped update settles.
      cancelledTransition = old;
      root.dataset.panelWipe = 'cancelled';
      old.skipTransition();
      void old.finished
        .catch(() => {})
        .finally(() => {
          if (cancelledTransition !== old) return;
          cancelledTransition = undefined;
          if (!transition && root.dataset.panelWipe === 'cancelled')
            root.removeAttribute('data-panel-wipe');
        });
    } else if (!cancelledTransition) root.removeAttribute('data-panel-wipe');
    apply();
  }
  function sync(mode) {
    const next = mode === 'nightShift',
      animate = selected;
    selected = false;
    if (next === target) {
      if (!transition) apply();
      return;
    }
    // Settle an interrupted direction before capturing the next theme.
    stop();
    target = next;
    if (
      !animate ||
      !shown() ||
      document.hidden ||
      reduced.matches ||
      forced.matches ||
      surface.dataset.panelMotion === 'off' ||
      document.querySelector('dialog[open]') ||
      typeof document.startViewTransition !== 'function'
    ) {
      apply();
      return;
    }
    const x = Math.max(0, Math.min(innerWidth, origin?.x ?? innerWidth / 2)),
      y = Math.max(0, Math.min(innerHeight, origin?.y ?? innerHeight / 2)),
      radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 4,
      token = ++sequence;
    root.dataset.panelWipe = next ? 'in' : 'out';
    try {
      const current = document.startViewTransition(() => {
        if (token === sequence) apply();
      });
      transition = current;
      // A delayed browser capture must not leave the palette waiting indefinitely.
      deadline = setTimeout(() => {
        if (token === sequence) stop();
      }, 1800);
      void current.ready
        .then(() => {
          if (token !== sequence) return;
          const frames = [
            { clipPath: `circle(0px at ${x}px ${y}px)` },
            { clipPath: `circle(${radius}px at ${x}px ${y}px)` },
          ];
          animation = root.animate(next ? frames : frames.reverse(), {
            duration: 680,
            easing: 'cubic-bezier(.76,0,.24,1)',
            fill: 'both',
            pseudoElement: `::view-transition-${next ? 'new' : 'old'}(root)`,
          });
        })
        .catch(() => {
          if (token === sequence) stop();
        });
      void current.finished
        .catch(() => {})
        .finally(() => {
          if (token === sequence) {
            clearTimeout(deadline);
            animation?.cancel();
            animation = undefined;
            transition = undefined;
            root.removeAttribute('data-panel-wipe');
            apply();
          }
        });
    } catch {
      stop();
    }
  }
  picker.addEventListener(
    'change',
    () => {
      selected = true;
      const rect = picker.getBoundingClientRect();
      origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      setTimeout(() => {
        selected = false;
      }, 0);
    },
    { capture: true },
  );
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
  });
  window.addEventListener('resize', stop);
  window.addEventListener('pagehide', stop);
  window.addEventListener('beforeprint', stop);
  reduced.addEventListener('change', stop);
  forced.addEventListener('change', stop);
  new MutationObserver(() => {
    if (surface.dataset.panelMotion === 'off') stop();
  }).observe(surface, { attributes: true, attributeFilter: ['data-panel-motion'] });
  new MutationObserver(() => {
    if (!shown()) stop();
    else if (!transition) apply();
  }).observe(body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver((records) => {
    if (transition && records.some((r) => r.target.tagName === 'DIALOG' && r.target.open)) stop();
  }).observe(body, { attributes: true, subtree: true, attributeFilter: ['open'] });
  return {
    sync,
    reset() {
      target = selected = false;
      stop();
    },
  };
}
