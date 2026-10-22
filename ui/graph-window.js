import { t } from '../i18n/index.js';

// Viewport expansion is local presentation state, never native fullscreen or saved settings.
export function createGraphWindow(dialog, filters, button) {
  let expanded = false;
  let filtersWereOpen = true;
  function render() {
    dialog.classList.toggle('graph-expanded', expanded);
    button.setAttribute('aria-pressed', String(expanded));
    const label = t(expanded ? 'graphRestoreWindow' : 'graphFullScreen');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.querySelector('.graph-window-label').textContent = label;
  }
  function setExpanded(value) {
    if (value === expanded) return;
    if (value) {
      filtersWereOpen = filters.open;
      filters.open = false;
    } else filters.open = filtersWereOpen;
    expanded = value;
    render();
    dialog.scrollTop = 0;
  }
  button.addEventListener('click', () => setExpanded(!expanded));
  dialog.addEventListener('cancel', (event) => {
    if (!expanded) return;
    event.preventDefault();
    setExpanded(false);
    button.focus({ preventScroll: true });
  });
  return {
    render,
    reset() {
      expanded = false;
      filtersWereOpen = true;
      filters.open = true;
      dialog.scrollTop = 0;
      render();
    },
  };
}
