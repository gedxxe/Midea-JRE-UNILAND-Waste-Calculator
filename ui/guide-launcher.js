import { $, node } from './dom.js';
import { t } from '../i18n/index.js';

// A browser preference only. Never put this in workspace backups or API requests.
const SEEN_KEY = 'midea_guide_seen_v1';
export function createGuideLauncher({ toast }) {
  let owner = null;
  let generation = 0;
  let guide = null;
  let loading = null;
  const seen = new Set();
  const button = $('open-guide');
  const invitation = $('guide-invitation');
  const status = $('guide-load-status');
  function markSeen() {
    if (!owner) return;
    seen.add(owner);
    try {
      const ids = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      // Bounded preferences; account changes never expose a different account's state.
      const valid = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
      localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...valid, owner])].slice(-50)));
    } catch {
      // Dismissal still works for this visit when storage is unavailable.
    }
    invitation.hidden = true;
  }
  function load() {
    if (!loading) {
      const css = node('link');
      css.rel = 'stylesheet';
      css.href = './guide.css';
      const styled = new Promise((resolve, reject) => {
        css.onload = resolve;
        css.onerror = reject;
      });
      document.head.append(css);
      loading = Promise.all([import('./guide.js'), styled])
        .then(([module]) => (guide = module.createGuide()))
        .catch((error) => {
          css.remove();
          loading = null;
          throw error;
        });
    }
    return loading;
  }
  async function open() {
    if (!owner || button.disabled) return;
    const epoch = generation;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.textContent = t('guideLoading');
    try {
      const loaded = await load();
      if (epoch !== generation || !owner) return;
      if (loaded.open(button)) markSeen();
    } catch {
      if (epoch === generation && owner) toast(t('guideLoadFailed'));
    } finally {
      if (epoch === generation) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        status.textContent = '';
      }
    }
  }
  button.addEventListener('click', () => void open());
  $('start-guide').addEventListener('click', () => void open());
  $('dismiss-guide').addEventListener('click', markSeen);
  return {
    reset(user) {
      generation++;
      guide?.close(false);
      owner = user && !user.mustChangePassword ? user.id : null;
      button.disabled = !owner;
      button.removeAttribute('aria-busy');
      status.textContent = '';
      let dismissed = !owner || seen.has(owner);
      try {
        const ids = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
        dismissed ||= Array.isArray(ids) && ids.includes(owner);
      } catch {
        // No persistent preference; the guide remains optional.
      }
      invitation.hidden = dismissed;
    },
    translate() {
      if (button.hasAttribute('aria-busy')) status.textContent = t('guideLoading');
      guide?.translate();
    },
  };
}
