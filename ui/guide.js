import { node } from './dom.js';
import { getLanguage, LANGUAGES, t } from '../i18n/index.js';
import { guideMessages } from '../i18n/guide.js';

const STEPS = ['Period', 'Table', 'Import', 'Utilities', 'Save', 'Copy', 'History', 'Graphs'];
const message = (key, values = {}) =>
  guideMessages[key][LANGUAGES.indexOf(getLanguage())].replace(/\{(\w+)\}/g, (_, k) => values[k]);
const svgNode = (tag, attrs = {}, text) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (text !== undefined) el.textContent = text;
  return el;
};

// Decorative, synthetic UI. No selectors, draft values or real control events enter this scene.
function illustration(step) {
  const svg = svgNode('svg', { viewBox: '0 0 480 240', 'aria-hidden': 'true' });
  const rect = (x, y, width, height, cls = 'guide-mock-box') => {
    const el = svgNode('rect', { x, y, width, height, rx: 7, class: cls });
    svg.append(el);
    return el;
  };
  const text = (x, y, value, cls = 'guide-mock-text') =>
    svg.append(svgNode('text', { x, y, class: cls }, value));
  const path = (d, cls) => svg.append(svgNode('path', { d, class: cls }));
  rect(38, 20, 404, 196, 'guide-mock-window');
  path('M38 54H442', 'guide-mock-rule');
  for (let i = 0; i < 3; i++)
    svg.append(svgNode('circle', { cx: 54 + i * 11, cy: 37, r: 2.5, class: 'guide-mock-dot' }));
  text(316, 41, 'JRE / UNILAND', 'guide-mock-caption');
  const bars = (y, count = 3) => {
    for (let i = 0; i < count; i++) {
      rect(60, y + i * 26, 88, 7, 'guide-mock-skeleton');
      rect(200, y + i * 26, 54, 7, 'guide-mock-skeleton');
      rect(334, y + i * 26, 54, 7, 'guide-mock-skeleton');
    }
  };
  let target;
  switch (step) {
    case 'Period':
      text(60, 80, 'JRE');
      text(123, 80, 'UNILAND', 'guide-mock-caption');
      rect(60, 97, 172, 40);
      rect(248, 97, 172, 40);
      text(75, 122, 'DD / MM / YYYY');
      text(263, 122, 'DD / MM / YYYY');
      text(60, 183, '08:00 → 17:00 WIB', 'guide-mock-caption');
      target = 'AFTER PRODUCTION';
      break;
    case 'Table':
      text(60, 82, 'kWh');
      text(200, 82, 'Start');
      text(334, 82, 'End');
      bars(103, 2);
      path('M60 92H420 M60 119H420 M60 145H420', 'guide-mock-rule');
      target = message('guideMockReading');
      break;
    case 'Import':
      text(60, 82, 'Start');
      text(130, 82, 'End');
      rect(60, 94, 360, 54);
      text(75, 117, '1. Total: ____');
      text(75, 135, '2. Indoor: ____ (Ratio 250)', 'guide-mock-caption');
      target = message('guideMockApply');
      break;
    case 'Utilities':
      ['LPG %', 'O₂ mmWC', 'N₂ mmH₂O', 'R32 mm / °C'].forEach((label, i) => {
        rect(60 + i * 92, 74, 84, 65);
        text(69 + i * 92, 100, label, 'guide-mock-caption');
        rect(70 + i * 92, 116, 46, 6, 'guide-mock-skeleton');
      });
      text(60, 184, 'End − Start', 'guide-mock-caption');
      target = 'Water · m³';
      break;
    case 'Save':
      path(
        'M89 121H75a13 13 0 0 1-1-26 21 21 0 0 1 40-2 14 14 0 0 1 1 28h-8 M84 107l9 9 18-20',
        'guide-mock-line',
      );
      text(140, 102, message('guideMockSave'));
      rect(140, 117, 214, 7, 'guide-mock-skeleton');
      target = message('guideMockSave');
      break;
    case 'Copy':
      rect(60, 72, 169, 80);
      rect(246, 72, 174, 80);
      text(74, 96, 'Raw');
      text(260, 96, 'kWh / MWh');
      for (let i = 0; i < 3; i++) {
        rect(74, 109 + i * 12, 113 - i * 12, 4, 'guide-mock-skeleton');
        rect(260, 109 + i * 12, 113 - i * 12, 4, 'guide-mock-skeleton');
      }
      target = message('guideMockCopy');
      break;
    case 'History':
      text(60, 80, 'Historian');
      bars(100, 2);
      text(60, 185, 'JRE / UNILAND', 'guide-mock-caption');
      target = message('guideMockOpen');
      break;
    case 'Graphs':
      for (let i = 0; i < 3; i++) path(`M60 ${79 + i * 30}H420`, 'guide-mock-rule');
      path('M60 74V147H420', 'guide-mock-axis');
      path('M62 126L113 107 163 114 215 86 266 101 317 80 368 93 416 73', 'guide-mock-line');
      path(
        'M62 139L113 134 163 122 215 129 266 110 317 126 368 111 416 114',
        'guide-mock-secondary',
      );
      target = message('guideMockGraph');
      break;
  }
  rect(279, 163, 141, 34, 'guide-mock-target');
  text(291, 185, target, 'guide-mock-target-text');
  text(60, 204, message('guidePreview'), 'guide-mock-caption');
  svg.append(svgNode('circle', { cx: 342, cy: 179, r: 15, class: 'guide-click guide-motion' }));
  const cursor = svgNode('g', { class: 'guide-cursor guide-motion' });
  cursor.append(svgNode('path', { d: 'M0 0L5 25L11 18L17 28L22 25L16 15L26 14Z' }));
  svg.append(cursor);
  return svg;
}

export function createGuide() {
  let index = 0;
  let paused = false;
  let opener = null;
  const dialog = node('dialog', undefined, 'guide-dialog');
  dialog.id = 'guide-dialog';
  dialog.setAttribute('aria-labelledby', 'guide-title');
  dialog.setAttribute('aria-describedby', 'guide-description');
  const panel = node('div', undefined, 'guide-panel');
  const header = node('div', undefined, 'guide-top');
  const label = node('span', undefined, 'guide-eyebrow');
  const close = node('button', '×', 'guide-close');
  close.type = 'button';
  header.append(label, close);
  const scene = node('div', undefined, 'guide-scene');
  const sceneFooter = node('div', undefined, 'guide-scene-footer');
  const demo = node('span');
  const pause = node('button', undefined, 'text-button');
  pause.type = 'button';
  pause.id = 'guide-pause';
  sceneFooter.append(demo, pause);
  const content = node('div', undefined, 'guide-content');
  const progress = node('p', undefined, 'guide-progress');
  progress.setAttribute('role', 'status');
  const title = node('h2');
  title.id = 'guide-title';
  title.tabIndex = -1;
  const description = node('p');
  description.id = 'guide-description';
  const place = node('p', undefined, 'guide-place');
  const nav = node('div', undefined, 'guide-nav');
  const back = node('button', undefined, 'button secondary');
  back.id = 'guide-back';
  back.type = 'button';
  const next = node('button', undefined, 'button primary');
  next.id = 'guide-next';
  next.type = 'button';
  nav.append(back, next);
  content.append(progress, title, description, place);
  panel.append(header, scene, sceneFooter, content, nav);
  dialog.append(panel);
  document.body.append(dialog);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  function playback() {
    dialog.dataset.paused = String(paused || document.hidden || !dialog.open);
    pause.hidden = motion.matches;
    if (motion.matches && document.activeElement === pause) title.focus({ preventScroll: true });
    pause.textContent = message(paused ? 'guideResume' : 'guidePause');
    pause.setAttribute('aria-pressed', String(paused));
  }
  function translate(focus = false) {
    label.textContent = message('guideLabel');
    close.setAttribute('aria-label', t('close'));
    progress.textContent = message('guideStep', { step: index + 1, total: STEPS.length });
    title.textContent = message(`guide${STEPS[index]}Title`);
    description.textContent = message(`guide${STEPS[index]}Body`);
    place.textContent = message('guideWhere', { place: message(`guide${STEPS[index]}Place`) });
    back.textContent = message('guideBack');
    back.disabled = index === 0;
    next.textContent = message(index === STEPS.length - 1 ? 'guideFinish' : 'guideNext');
    demo.textContent = message('guideDemo');
    scene.replaceChildren(illustration(STEPS[index]));
    dialog.dataset.step = STEPS[index];
    playback();
    if (focus) {
      content.scrollTop = 0;
      title.focus({ preventScroll: true });
    }
  }
  function finish(restoreFocus = true) {
    // Remove the return target before closing on an identity change.
    const target = restoreFocus ? opener : null;
    opener = null;
    dialog.close();
    playback();
    if (target?.isConnected && !target.closest('[hidden]') && !target.disabled)
      target.focus({ preventScroll: true });
  }
  close.addEventListener('click', () => finish());
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    finish();
  });
  dialog.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && ['s', 'Enter'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('button:not(:disabled)')].filter(
        (el) => !el.hidden,
      );
      const first = controls[0],
        last = controls.at(-1),
        active = document.activeElement;
      if (!controls.includes(active) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  });
  back.addEventListener('click', () => {
    if (index > 0) index--;
    translate(true);
  });
  next.addEventListener('click', () => {
    if (index === STEPS.length - 1) finish();
    else {
      index++;
      translate(true);
    }
  });
  pause.addEventListener('click', () => {
    paused = !paused;
    playback();
  });
  document.addEventListener('visibilitychange', playback);
  motion.addEventListener('change', playback);
  return {
    open(trigger) {
      if (document.querySelector('dialog[open]')) return false;
      opener = trigger;
      index = 0;
      translate();
      dialog.showModal();
      playback();
      title.focus({ preventScroll: true });
      return true;
    },
    close: finish,
    translate: () => translate(),
  };
}
