import {
  counterSlots,
  counterTrend,
  stepBetween,
  mod,
  wrap,
  nextClockSecond,
} from '../counter-model.js';

// Adapted from the supplied React Bits Counter springs and digit strips (David Haz).
// MIT + Commons Clause: asset/licenses/react-bits.txt. The canonical sibling stays
// selectable/accessibly readable and owns layout. Decorative intermediate digits never
// enter reports, calculations, clipboard text or the underlying metric element.
export function createCounter(source, { clock = false, allowed }) {
  if (typeof ResizeObserver !== 'function' || typeof IntersectionObserver !== 'function')
    return null;
  const host = document.createElement('span');
  host.className = 'counter-host';
  const row = document.createElement('span');
  row.className = 'counter-row';
  row.setAttribute('aria-hidden', 'true');
  source.before(host);
  host.append(source, row);
  source.classList.add('counter-source');
  row.hidden = true;
  if (getComputedStyle(row).position !== 'absolute') {
    source.classList.remove('counter-source');
    host.before(source);
    host.remove();
    return null;
  }
  const items = new Map();
  let previous = source.textContent,
    scope,
    raf = 0,
    last = 0,
    began = 0,
    visible = false,
    destroyed = false,
    layout = '',
    introduced = false,
    prepared = false;
  const active = () => !destroyed && visible && allowed() && !source.closest('[hidden], [inert]');
  const moving = () => host.dataset.rolling === 'true';
  function paint(item) {
    if (
      item.kind !== 'digit' ||
      (item.lastPaintPos === item.pos &&
        item.lastPaintShown === item.shown &&
        item.lastPaintVel === item.vel)
    )
      return;
    item.lastPaintPos = item.pos;
    item.lastPaintShown = item.shown;
    item.lastPaintVel = item.vel;
    item.numerals.forEach((numeral, n) => {
      numeral.style.transform = `translateY(${(wrap(n - item.pos) * 100).toFixed(3)}%)`;
    });
    item.el.style.opacity = String(Math.max(0, Math.min(1, item.shown)));
    if (item.blur) {
      const radius = Math.min(0.055, Math.max(0, Math.abs(item.vel) - 3) * 0.004);
      item.blur.setAttribute('stdDeviation', '0 ' + (radius * item.em).toFixed(2));
      item.strip.style.filter = radius > 0.008 ? `url(#${item.filter})` : '';
    }
  }
  function settle() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    for (const [key, item] of items) {
      if (item.exiting) {
        item.el.remove();
        items.delete(key);
        continue;
      }
      item.pos = item.target = mod(Math.round(item.target), 10);
      item.vel = 0;
      item.shown = 1;
      item.shownVel = 0;
      item.wait = 0;
    }
    host.dataset.rolling = 'false';
    row.hidden = true;
  }
  function measure() {
    const styles = getComputedStyle(source);
    for (const property of [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'letterSpacing',
      'fontVariantNumeric',
      'lineHeight',
      'color',
    ])
      row.style[property] = styles[property];
    const line = Number.parseFloat(styles.lineHeight),
      em = Number.parseFloat(styles.fontSize) || 16;
    row.style.setProperty('--counter-step', (Number.isFinite(line) ? line : em * 1.2) + 'px');
    // Existing source geometry remains the only layout authority, including on resize.
    row.style.left = source.offsetLeft + 'px';
    row.style.top = source.offsetTop + 'px';
    for (const item of items.values()) item.em = em;
  }
  function make(slot) {
    const el = document.createElement('span');
    const item = {
      ...slot,
      el,
      pos: slot.digit || 0,
      target: slot.digit || 0,
      vel: 0,
      shown: 1,
      shownVel: 0,
      shownTarget: 1,
      wait: 0,
      exiting: false,
      em: Number.parseFloat(getComputedStyle(source).fontSize) || 16,
    };
    el.className = 'counter-' + slot.kind;
    if (slot.kind === 'symbol') el.textContent = slot.text;
    else {
      const sizer = document.createElement('span');
      sizer.className = 'counter-sizer';
      sizer.textContent = '0';
      const window = document.createElement('span');
      window.className = 'counter-window';
      const strip = document.createElement('span');
      strip.className = 'counter-strip';
      item.strip = strip;
      item.numerals = Array.from({ length: 10 }, (_, n) => {
        const numeral = document.createElement('span');
        numeral.className = 'counter-numeral';
        numeral.textContent = String(n);
        strip.append(numeral);
        return numeral;
      });
      window.append(strip);
      el.append(sizer, window);
      if (!clock && source.id === 'main-total') {
        const ns = 'http://www.w3.org/2000/svg',
          svg = document.createElementNS(ns, 'svg'),
          filter = document.createElementNS(ns, 'filter'),
          blur = document.createElementNS(ns, 'feGaussianBlur');
        svg.classList.add('counter-blur');
        filter.id = 'counter-' + source.id + '-' + slot.key;
        for (const [key, value] of Object.entries({
          x: '-10%',
          y: '-50%',
          width: '120%',
          height: '200%',
          colorInterpolationFilters: 'sRGB',
        }))
          filter.setAttribute(key, value);
        blur.setAttribute('stdDeviation', '0 0');
        filter.append(blur);
        svg.append(filter);
        el.append(svg);
        item.blur = blur;
        item.filter = filter.id;
      }
    }
    row.append(el);
    items.set(slot.key, item);
    return item;
  }
  function frame(now) {
    raf = 0;
    if (!active() || now - began > 2200) {
      settle();
      return;
    }
    const elapsed = Math.max(0, Math.min((now - last) / 1000, 1 / 20));
    last = now;
    const duration = clock ? 0.38 : 0.55,
      omega = (Math.PI * 2) / duration,
      zeta = 0.88,
      presence = (Math.PI * 2) / (duration * 0.85);
    let busy = false;
    for (const [key, item] of items) {
      if (item.kind !== 'digit') continue;
      let left = elapsed;
      if (item.wait > 0) {
        const used = Math.min(item.wait, left);
        item.wait -= used;
        left -= used;
      }
      if (left > 0) {
        const steps = Math.ceil(left * 240),
          dt = left / steps;
        for (let i = 0; i < steps; i++) {
          item.vel +=
            (-omega * omega * (item.pos - item.target) - 2 * zeta * omega * item.vel) * dt;
          item.pos += item.vel * dt;
          item.shownVel +=
            (-presence * presence * (item.shown - item.shownTarget) -
              2 * presence * item.shownVel) *
            dt;
          item.shown += item.shownVel * dt;
        }
      }
      const done =
        item.wait <= 0 &&
        Math.abs(item.pos - item.target) < 0.002 &&
        Math.abs(item.vel) < 0.02 &&
        Math.abs(item.shown - item.shownTarget) < 0.002 &&
        Math.abs(item.shownVel) < 0.02;
      if (done) {
        item.target = mod(Math.round(item.target), 10);
        item.pos = item.target;
        item.vel = 0;
        item.shown = item.shownTarget;
        item.shownVel = 0;
        if (item.exiting) {
          item.el.remove();
          items.delete(key);
          continue;
        }
      } else busy = true;
      paint(item);
    }
    if (busy) raf = requestAnimationFrame(frame);
    else settle();
  }
  function prepare(slots = counterSlots(previous, clock)) {
    row.replaceChildren();
    items.clear();
    prepared = !!slots;
    if (!slots) {
      layout = '';
      return;
    }
    for (const slot of slots) make(slot);
    layout = slots.map((slot) => slot.key).join();
    measure();
  }
  function update(text, nextScope) {
    source.textContent = text;
    const slots = counterSlots(text, clock),
      signChanged = /^[+-]/.exec(previous)?.[0] !== /^[+-]/.exec(text)?.[0];
    if (!slots) {
      settle();
      row.replaceChildren();
      items.clear();
      previous = text;
      scope = nextScope;
      layout = '';
      prepared = false;
      return;
    }
    if (text === previous && nextScope === scope) return;
    if (!active()) {
      settle();
      row.replaceChildren();
      items.clear();
      prepared = false;
      previous = text;
      scope = nextScope;
      layout = '';
      return;
    }
    if (!prepared) prepare(counterSlots(previous, clock));
    const animate =
      scope === nextScope &&
      !!counterSlots(previous, clock) &&
      !signChanged &&
      active() &&
      (!clock || nextClockSecond(previous, text));
    if (!animate) {
      settle();
      previous = text;
      scope = nextScope;
      prepare(slots);
      return;
    }
    const trend = clock ? 'up' : counterTrend(previous, text),
      next = new Set(slots.map((slot) => slot.key)),
      changed = [];
    for (const slot of slots) {
      let item = items.get(slot.key);
      if (!item) {
        item = make(slot);
        if (slot.kind === 'digit') {
          item.pos = item.target = 0;
          item.shown = 0;
        }
      }
      item.rank = slot.rank;
      item.exiting = false;
      item.shownTarget = 1;
      if (slot.kind !== 'digit') {
        item.el.textContent = slot.text;
        continue;
      }
      const step = stepBetween(mod(Math.round(item.target), 10), slot.digit, trend);
      if (step || item.shown < 1) {
        item.target += step;
        changed.push(item);
      }
      if (Math.abs(item.target - item.pos) > 20) {
        item.pos = item.target;
        item.vel = 0;
      }
    }
    for (const [key, item] of items)
      if (!next.has(key)) {
        if (item.kind === 'symbol') {
          item.el.remove();
          items.delete(key);
        } else {
          item.exiting = true;
          item.shownTarget = 0;
          item.target += stepBetween(mod(Math.round(item.target), 10), 0, trend);
          changed.push(item);
        }
      }
    changed
      .sort((a, b) => b.rank - a.rank)
      .forEach((item, i) => {
        item.wait = i * (clock ? 0.012 : 0.025);
      });
    const key = slots.map((s) => s.key).join();
    if (key !== layout) {
      for (const item of [...items.values()].sort((a, b) => a.rank - b.rank)) row.append(item.el);
      layout = key;
    }
    previous = text;
    scope = nextScope;
    if (!changed.length) {
      settle();
      return;
    }
    measure();
    for (const item of items.values()) paint(item);
    host.dataset.rolling = 'true';
    row.hidden = false;
    began = performance.now();
    if (!raf) {
      last = began;
      raf = requestAnimationFrame(frame);
    }
  }
  function intro() {
    if (clock || introduced || !active() || !counterSlots(previous) || !items.size) return;
    introduced = true;
    if (moving()) return;
    [...items.values()]
      .filter((item) => item.kind === 'digit')
      .sort((a, b) => a.rank - b.rank)
      .forEach((item, i) => {
        item.target += 10;
        item.wait = i * 0.018;
      });
    measure();
    for (const item of items.values()) paint(item);
    host.dataset.rolling = 'true';
    row.hidden = false;
    began = last = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);
  }
  const resize = new ResizeObserver(() => {
    if (moving()) {
      const styles = getComputedStyle(source);
      if (
        row.style.fontSize !== styles.fontSize ||
        row.style.lineHeight !== styles.lineHeight ||
        source.getClientRects().length > 1
      )
        settle();
      measure();
    }
  });
  resize.observe(source);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (!visible) settle();
    else {
      if (!prepared) prepare();
      intro();
    }
  });
  intersection.observe(source);
  return {
    update,
    sync() {
      if (!active()) settle();
      else {
        if (!prepared) prepare();
        intro();
      }
    },
    reset() {
      scope = undefined;
      introduced = false;
      settle();
      previous = '';
      prepared = false;
      row.replaceChildren();
      items.clear();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      settle();
      resize.disconnect();
      intersection.disconnect();
      source.classList.remove('counter-source');
      host.before(source);
      host.remove();
    },
  };
}
