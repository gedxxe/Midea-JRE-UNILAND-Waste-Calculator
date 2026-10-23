import { t } from '../i18n/index.js';
import { createSignInTransition } from './signin-transition.js';

// Presentation only. The account controller remains responsible for every session gate.
export function createWelcome() {
  const hero = document.getElementById('welcome-hero');
  const surface = document.getElementById('application-surface');
  const enter = document.getElementById('open-login');
  const back = document.getElementById('back-welcome');
  const pause = document.getElementById('pause-welcome');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const language = document.getElementById('language-select');
  const heroLanguage = document.getElementById('welcome-language');
  let stage = 'hero',
    identity,
    user,
    sequence = 0,
    transition,
    transitionTarget,
    circleOrigin;
  let tech,
    magnet,
    ascii,
    loading = false,
    initialized = false,
    dialogOpen = !!document.querySelector('dialog[open]');
  const motionAllowed = () =>
    !document.hidden &&
    hero.dataset.motion !== 'off' &&
    hero.dataset.paused !== 'true' &&
    !reduced.matches;
  const moving = () => stage === 'hero' && !hero.hidden && !dialogOpen && motionAllowed();
  const signin = createSignInTransition({ moving: motionAllowed });

  function syncMotion() {
    const key = hero.dataset.paused === 'true' ? 'welcomeResume' : 'welcomePause';
    pause.dataset.i18nAriaLabel = key;
    pause.setAttribute('aria-label', t(key));
    pause.setAttribute('aria-pressed', String(hero.dataset.paused === 'true'));
    pause.firstElementChild.textContent = hero.dataset.paused === 'true' ? '▶' : 'Ⅱ';
    tech?.sync();
    magnet?.sync();
    ascii?.sync();
    signin.sync();
    if (!moving() || loading || initialized) return;
    loading = true;
    initialized = true;
    void Promise.allSettled([
      import('./welcome-tech.js'),
      import('./welcome-magnet.js'),
      import('./welcome-ascii.js'),
    ])
      .then((results) => {
        if (stage !== 'hero' && !(stage === 'transition' && transitionTarget === 'hero')) return;
        const initialize = (index, build) => {
          if (results[index].status === 'fulfilled') {
            try {
              return build(results[index].value);
            } catch {
              /* Optional decoration. */
            }
          }
        };
        tech ||= initialize(0, (module) =>
          module.createTechText(
            hero.querySelector('.energy-wordmark'),
            hero.querySelector('.energy-tech-letters'),
            moving,
          ),
        );
        magnet ||= initialize(1, (module) => module.createWelcomeMagnet(enter, moving));
        ascii ||= initialize(2, (module) =>
          module.createGradientAscii(hero, hero.querySelector('.energy-ascii-canvas'), moving),
        );
      })
      .finally(() => {
        loading = false;
        if (stage === 'hero' && !initialized) syncMotion();
      });
  }
  function stopDecoration() {
    tech?.destroy();
    magnet?.destroy();
    ascii?.destroy();
    tech = magnet = ascii = undefined;
  }
  function show(next, focus = false) {
    sequence++;
    transition?.cancel();
    transition = undefined;
    transitionTarget = undefined;
    stage = next;
    document.body.dataset.welcome = next;
    hero.hidden = next !== 'hero';
    hero.inert = next !== 'hero';
    surface.hidden = next === 'hero';
    surface.inert = next === 'hero';
    surface.classList.remove('welcome-revealing');
    back.hidden = next !== 'login' || !!user;
    if (next !== 'hero') {
      ascii?.destroy();
      ascii = undefined;
      initialized = false;
    }
    if (next === 'workspace' || user) stopDecoration();
    syncMotion();
    if (focus) {
      window.scrollTo(0, 0);
      const target =
        next === 'hero'
          ? enter
          : document.getElementById(
              user?.mustChangePassword ? 'current-password' : 'login-username',
            );
      target?.focus({ preventScroll: true });
    }
  }
  async function reveal(event, next = 'login') {
    if (user || (next === 'login' ? stage !== 'hero' : stage !== 'login')) return;
    if (
      !motionAllowed() ||
      !surface.animate ||
      !CSS.supports('clip-path', 'circle(1px at 1px 1px)')
    ) {
      show(next, true);
      return;
    }
    const returning = next === 'hero';
    if (!returning) {
      const rect = enter.getBoundingClientRect();
      circleOrigin = {
        x: event.detail ? event.clientX : rect.left + rect.width / 2,
        y: event.detail ? event.clientY : rect.top + rect.height / 2,
      };
    }
    const x = Math.max(0, Math.min(innerWidth, circleOrigin?.x ?? innerWidth / 2));
    const y = Math.max(0, Math.min(innerHeight, circleOrigin?.y ?? innerHeight / 2));
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    stage = 'transition';
    transitionTarget = next;
    const token = ++sequence;
    hero.hidden = false;
    hero.inert = true;
    surface.hidden = false;
    surface.inert = true;
    surface.classList.add('welcome-revealing');
    // Back reveals a complete static hero below the shrinking white surface.
    // Effects resume only after both presentation and focus have settled.
    syncMotion();
    const frames = [
      { clipPath: `circle(0px at ${x}px ${y}px)` },
      { clipPath: `circle(${radius + 4}px at ${x}px ${y}px)` },
    ];
    try {
      transition = surface.animate(returning ? frames.reverse() : frames, {
        duration: 820,
        easing: 'cubic-bezier(.76,0,.24,1)',
        fill: 'both',
      });
      await transition.finished;
    } catch {
      /* Interrupted motion must leave the intended destination usable. */
    }
    if (sequence === token && stage === 'transition') show(next, true);
  }
  function settleTransition(focus = true) {
    if (stage === 'transition') show(transitionTarget, focus);
  }
  enter.addEventListener('click', (event) => void reveal(event));
  back.addEventListener('click', (event) => {
    if (!user) {
      signin.reset();
      void reveal(event, 'hero');
    }
  });
  pause.addEventListener('click', () => {
    hero.dataset.paused = String(hero.dataset.paused !== 'true');
    syncMotion();
  });
  heroLanguage.addEventListener('change', () => {
    language.value = heroLanguage.value;
    language.dispatchEvent(new Event('change', { bubbles: true }));
  });
  language.addEventListener('change', () => {
    heroLanguage.value = language.value;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) settleTransition(false);
    syncMotion();
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches) settleTransition();
    syncMotion();
  });
  window.addEventListener('resize', () => {
    settleTransition();
  });
  new MutationObserver(() => {
    if (hero.dataset.motion === 'off') settleTransition();
    syncMotion();
  }).observe(hero, { attributes: true, attributeFilter: ['data-motion'] });
  new MutationObserver(() => {
    heroLanguage.value = language.value;
    syncMotion();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  new MutationObserver((records) => {
    if (!records.some((record) => record.target.tagName === 'DIALOG')) return;
    dialogOpen = !!document.querySelector('dialog[open]');
    syncMotion();
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['open'] });
  syncMotion();
  return {
    authActivity: (status) => signin.activity(status),
    sync(state) {
      user = state.user;
      heroLanguage.value = language.value;
      const nextIdentity = user ? `${user.id}:${!!user.mustChangePassword}` : null;
      if (!state.ready || nextIdentity === identity) return;
      const wasKnown = identity !== undefined;
      identity = nextIdentity;
      if (user) {
        show(user.mustChangePassword ? 'login' : 'workspace');
        signin.finish();
        document
          .getElementById(user.mustChangePassword ? 'current-password' : 'start-date')
          ?.focus({ preventScroll: true });
      } else if (wasKnown) {
        signin.reset();
        show('hero', true);
      }
    },
  };
}
