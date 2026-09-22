import { catalog } from './catalog.js';

export const LANGUAGES = ['en', 'zh-CN', 'id'];
export const LANGUAGE_KEY = 'midea_energy_language';
let language = 'en';

export function setLanguage(value) {
  language = LANGUAGES.includes(value) ? value : 'en';
  return language;
}

export function getLanguage() {
  return language;
}

export function t(key, values = {}) {
  const message = catalog[key]?.[LANGUAGES.indexOf(language)];
  if (message === undefined) throw new Error(`Unknown translation: ${key}`);
  return message.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
}

export function translatePage(root = document) {
  root.documentElement.lang = language;
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const attribute of ['placeholder', 'aria-label', 'title']) {
    for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
    }
  }
}
