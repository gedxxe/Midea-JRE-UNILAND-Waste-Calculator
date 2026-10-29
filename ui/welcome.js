import { t } from '../i18n/index.js';
import { createLazyGlassSurface } from './dialog-motion.js';
import { createSignInTransition } from './signin-transition.js';

// Presentation only. The account controller remains responsible for every session gate.
export function createWelcome() {
  const hero = document.getElementById('welcome-hero');
  const surface = document.getElementById('application-surface');
  const enter = document.getElementById('open-login');
  const back = document.getElementById('back-welcome');
  const pause = document.getElementById('pause-welcome');
  const wordmark = hero.querySelector('.energy-wordmark');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const language = document.getElementById('language-select');
  const heroLanguage = document.getElementById('welcome-language');
  let stage = 'hero',
    identity,
    user,
    sequence = 0,
    transition,
    transitionTarget,
    circleOrigin,
    loginGlass,
    titleTimer,
    specular,
    specularLoading = false;
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
    specular?.sync();
    if (stage === 'login' && motionAllowed() && !specular && !specularLoading) {
      specularLoading = true;
      void import('./signin-specular.js')
        .then((module) => {
          if (stage === 'login' && !user)
            specular = module.createSpecularButton(
              document.getElementById('login-submit'),
              () => stage === 'login' && !user && !dialogOpen && motionAllowed(),
            );
        })
        .catch(() => {
          /* Optional light never gates the form. */
        })
        .finally(() => {
          specularLoading = false;
        });
    }
    syncTitleWait();
    if (!moving() || loading || initialized) return;
    loading = true;
    initialized = true;
    const canInitialize = () =>
      !user && (stage === 'hero' || (stage === 'transition' && transitionTarget === 'hero'));
    // Each effect settles independently; a stalled background must not delay the title.
    void Promise.allSettled([
      import('./welcome-tech.js')
        .then((module) => {
          if (!canInitialize() || wordmark.dataset.titleFallback === 'true') return;
          tech ||= module.createTechText(
            wordmark,
            hero.querySelector('.energy-tech-canvas'),
            moving,
          );
          if (!tech) fallbackTitle();
        })
        .catch(() => {
          if (canInitialize()) fallbackTitle();
        }),
      import('./welcome-magnet.js').then((module) => {
        if (canInitialize()) magnet ||= module.createWelcomeMagnet(enter, moving);
      }),
      import('./welcome-ascii.js').then((module) => {
        if (canInitialize())
          ascii ||= module.createGradientAscii(
            hero,
            hero.querySelector('.energy-ascii-canvas'),
            moving,
          );
      }),
    ]).finally(() => {
      loading = false;
      if (stage === 'hero' && !initialized) syncMotion();
    });
  }
  function fallbackTitle() {
    clearTimeout(titleTimer);
    titleTimer = undefined;
    if (wordmark.dataset.ready !== 'true') wordmark.dataset.titleFallback = 'true';
  }
  function syncTitleWait() {
    if (
      !moving() ||
      wordmark.dataset.ready === 'true' ||
      wordmark.dataset.titleFallback === 'true'
    ) {
      clearTimeout(titleTimer);
      titleTimer = undefined;
    } else if (titleTimer === undefined) {
      // Optional animation cannot leave a permanently empty title after a stalled import.
      titleTimer = setTimeout(fallbackTitle, 3000);
    }
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
    if (next !== 'login') {
      specular?.destroy();
      specular = undefined;
    }
    document.body.dataset.welcome = next;
    hero.hidden = next !== 'hero';
    hero.inert = next !== 'hero';
    surface.hidden = next === 'hero';
    surface.inert = next === 'hero';
    surface.classList.remove('welcome-revealing');
    if (next === 'login')
      loginGlass ||= createLazyGlassSurface(document.querySelector('.account-card'));
    else {
      loginGlass?.destroy();
      loginGlass = undefined;
    }
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
    back.hidden = false;
    surface.scrollTop = 0;
    surface.classList.add('welcome-revealing');
    loginGlass ||= createLazyGlassSurface(document.querySelector('.account-card'));
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
  new MutationObserver(syncTitleWait).observe(wordmark, {
    attributes: true,
    attributeFilter: ['data-ready'],
  });
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
