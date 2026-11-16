import { t } from '../i18n/index.js';
import { catalog } from '../i18n/catalog.js';
import { createLazyGlassSurface } from './dialog-motion.js';
import { createSignInTransition } from './signin-transition.js';
import { node } from './dom.js';

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
  const greeting = document.getElementById('signin-greeting');
  const greetingTitle = document.getElementById('signin-greeting-label');
  const greetingAnimations = new Set();
  const greetingKeys = Object.keys(catalog).filter((key) => /^signinGreeting\d+$/.test(key));
  // Only a public greeting key is remembered, so refresh can avoid an immediate repeat.
  const greetingPreference = 'midea_signin_greeting';
  let previousGreeting;
  try {
    previousGreeting = sessionStorage.getItem(greetingPreference);
  } catch {
    /* Optional. */
  }
  const choices = greetingKeys.filter((key) => key !== previousGreeting);
  const greetingKey = choices[Math.floor(Math.random() * choices.length)];
  try {
    sessionStorage.setItem(greetingPreference, greetingKey);
  } catch {
    /* Random still works. */
  }
  if (greeting) greeting.dataset.greeting = greetingKey;
  let greetingText, greetingRun;
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

  function stopGreeting() {
    for (const animation of greetingAnimations) animation.cancel();
    greetingAnimations.clear();
  }
  function syncGreeting() {
    if (!greeting || !greetingTitle) return;
    greeting.hidden = !!user || !['login', 'transition'].includes(stage);
    if (greeting.hidden) {
      stopGreeting();
      greetingRun = undefined;
      return;
    }
    const lines = [...greetingTitle.querySelectorAll('.signin-greeting-line')];
    const copy = t(greetingKey).split('\n');
    const text = copy.join(' ');
    if (text !== greetingText || !greetingTitle.querySelector('.signin-reveal-character')) {
      stopGreeting();
      greetingText = text;
      greetingRun = undefined;
      greetingTitle.setAttribute('aria-label', text);
      const segmenter =
        typeof Intl.Segmenter === 'function'
          ? new Intl.Segmenter(document.documentElement.lang, { granularity: 'grapheme' })
          : null;
      const words = segmenter
        ? new Intl.Segmenter(document.documentElement.lang, { granularity: 'word' })
        : null;
      for (const [row, line] of lines.entries()) {
        line.replaceChildren();
        line.setAttribute('aria-hidden', 'true');
        if (!segmenter) {
          line.textContent = copy[row];
          continue;
        }
        for (const { segment: word } of words.segment(copy[row])) {
          if (!word) continue;
          if (/^\s+$/u.test(word)) {
            line.append(document.createTextNode(word));
            continue;
          }
          const group = node('span', undefined, 'signin-reveal-word');
          const characters = [...segmenter.segment(word)].map((s) => s.segment);
          for (const character of characters) {
            const cut = node('span', undefined, 'signin-reveal-cut');
            const glyph = node('span', character, 'signin-reveal-character');
            if (/\p{Extended_Pictographic}/u.test(character)) glyph.dataset.emoji = '';
            cut.append(glyph);
            group.append(cut);
          }
          line.append(group);
        }
      }
    }
    if (stage !== 'login' || dialogOpen || !motionAllowed()) {
      stopGreeting();
      if (stage === 'login') greetingRun = text;
      return;
    }
    if (greetingRun === text) return;
    greetingRun = text;
    // Character masks/stagger follow the reference; native sampled springs avoid a React runtime.
    // Mass 1, stiffness 200, damping 21. A finite WAAPI entrance never gates the form.
    const spring = Array.from({ length: 49 }, (_, i) => {
      const seconds = (i / 48) * 0.8;
      return i === 48
        ? 0
        : Math.exp(-10.5 * seconds) *
            (Math.cos(Math.sqrt(89.75) * seconds) +
              (10.5 / Math.sqrt(89.75)) * Math.sin(Math.sqrt(89.75) * seconds));
    });
    lines.forEach((line, row) => {
      const characters = [...line.querySelectorAll('.signin-reveal-character')];
      characters.forEach((glyph, index) => {
        const order =
          row === 1
            ? characters.length - 1 - index
            : row === 2
              ? Math.abs(index - (characters.length - 1) / 2)
              : index;
        try {
          const animation = glyph.animate(
            spring.map((value) => ({
              transform: `translateY(${value * (row === 1 ? -115 : 115)}%)`,
            })),
            {
              duration: 800,
              delay: [0, 280, 700][row] + order * 25,
              fill: 'backwards',
              easing: 'linear',
            },
          );
          greetingAnimations.add(animation);
          animation.finished.then(
            () => greetingAnimations.delete(animation),
            () => greetingAnimations.delete(animation),
          );
        } catch {
          /* Static characters remain visible when optional animation is unavailable. */
        }
      });
    });
  }
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
    syncGreeting();
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
