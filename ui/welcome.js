import { t } from '../i18n/index.js';

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
    transition;
  let tech,
    magnet,
    loading = false;
  const moving = () =>
    stage === 'hero' &&
    !hero.hidden &&
    !document.hidden &&
    hero.dataset.motion !== 'off' &&
    hero.dataset.paused !== 'true' &&
    !reduced.matches;

  function syncMotion() {
    const key = hero.dataset.paused === 'true' ? 'welcomeResume' : 'welcomePause';
    pause.dataset.i18nAriaLabel = key;
    pause.setAttribute('aria-label', t(key));
    pause.setAttribute('aria-pressed', String(hero.dataset.paused === 'true'));
    pause.firstElementChild.textContent = hero.dataset.paused === 'true' ? '▶' : 'Ⅱ';
    tech?.sync();
    magnet?.sync();
    if (!moving() || loading || tech || magnet) return;
    loading = true;
    void Promise.all([import('./welcome-tech.js'), import('./welcome-magnet.js')])
      .then(([{ createTechText }, { createWelcomeMagnet }]) => {
        if (stage !== 'hero') return;
        tech = createTechText(
          hero.querySelector('.energy-wordmark'),
          hero.querySelector('canvas'),
          moving,
        );
        magnet = createWelcomeMagnet(enter, moving);
      })
      .catch(() => {
        /* The HTML title and button work without decoration. */
      })
      .finally(() => {
        loading = false;
      });
  }
  function stopDecoration() {
    tech?.destroy();
    magnet?.destroy();
    tech = magnet = undefined;
  }
  function show(next, focus = false) {
    sequence++;
    transition?.cancel();
    transition = undefined;
    stage = next;
    document.body.dataset.welcome = next;
    hero.hidden = next !== 'hero';
    hero.inert = next !== 'hero';
    surface.hidden = next === 'hero';
    surface.inert = next === 'hero';
    surface.classList.remove('welcome-revealing');
    back.hidden = next !== 'login' || !!user;
    if (next !== 'hero') stopDecoration();
    else syncMotion();
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
  async function reveal(event) {
    if (stage !== 'hero') return;
    if (
      reduced.matches ||
      hero.dataset.motion === 'off' ||
      hero.dataset.paused === 'true' ||
      !surface.animate ||
      !CSS.supports('clip-path', 'circle(1px at 1px 1px)')
    ) {
      show('login', true);
      return;
    }
    stage = 'transition';
    const token = ++sequence;
    tech?.sync();
    magnet?.sync();
    hero.inert = true;
    surface.hidden = false;
    surface.inert = true;
    surface.classList.add('welcome-revealing');
    const rect = enter.getBoundingClientRect();
    const x = event.detail ? event.clientX : rect.left + rect.width / 2;
    const y = event.detail ? event.clientY : rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    try {
      transition = surface.animate(
        [
          { clipPath: `circle(0px at ${x}px ${y}px)` },
          { clipPath: `circle(${radius + 4}px at ${x}px ${y}px)` },
        ],
        { duration: 820, easing: 'cubic-bezier(.76,0,.24,1)', fill: 'both' },
      );
      await transition.finished;
    } catch {
      /* Unsupported or interrupted motion must not trap the form. */
    }
    if (sequence === token && stage === 'transition') show('login', true);
  }
  enter.addEventListener('click', (event) => void reveal(event));
  back.addEventListener('click', () => {
    if (!user) show('hero', true);
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
    if (document.hidden && stage === 'transition') show('login');
    syncMotion();
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches && stage === 'transition') show('login', true);
    syncMotion();
  });
  window.addEventListener('resize', () => {
    if (stage === 'transition') show('login', true);
  });
  new MutationObserver(() => {
    if (hero.dataset.motion === 'off' && stage === 'transition') show('login', true);
    syncMotion();
  }).observe(hero, { attributes: true, attributeFilter: ['data-motion'] });
  new MutationObserver(() => {
    heroLanguage.value = language.value;
    syncMotion();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  syncMotion();
  return {
    sync(state) {
      user = state.user;
      heroLanguage.value = language.value;
      const nextIdentity = user ? `${user.id}:${!!user.mustChangePassword}` : null;
      if (!state.ready || nextIdentity === identity) return;
      const wasKnown = identity !== undefined;
      identity = nextIdentity;
      if (user) {
        show(user.mustChangePassword ? 'login' : 'workspace');
        document
          .getElementById(user.mustChangePassword ? 'current-password' : 'start-date')
          ?.focus({ preventScroll: true });
      } else if (wasKnown) show('hero', true);
    },
  };
}
