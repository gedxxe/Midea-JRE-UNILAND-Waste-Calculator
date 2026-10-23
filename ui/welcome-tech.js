/* Adapted for this website from React Bits Tech Text and Split Text,
 * copyright (c) 2026 David Haz.
 * https://github.com/DavidHDev/react-bits/tree/e12c22192ac7b4b452c5e2feb9b586d74765d696
 * MIT + Commons Clause License Condition v1.0: /asset/licenses/react-bits.txt
 * Cached glyph art with compositor-only spring/entrance transforms; no frame repaint loop.
 */
const TEXT = 'Energy Record';
// Sample the same damped spring once. Browser compositing interpolates between samples.
const spring = Array.from({ length: 61 }, (_, index) => {
  const time = index / 60,
    decay = Math.exp(-9.5 * time),
    frequency = Math.sqrt(180 - 9.5 ** 2);
  return index === 60
    ? 1
    : 1 - decay * (Math.cos(frequency * time) + (9.5 / frequency) * Math.sin(frequency * time));
});
export function createTechText(container, host, allowed) {
  if (
    typeof ResizeObserver !== 'function' ||
    typeof IntersectionObserver !== 'function' ||
    !host.animate
  )
    return;
  let probe;
  try {
    probe = document.createElement('canvas').getContext('2d');
  } catch {
    return;
  }
  if (!probe) return;
  let glyphs = [],
    hover = -1,
    alive = true,
    visible = true,
    entered = false,
    layoutKey = '';
  const font = (context, size) => {
    context.font = `700 ${size}px Arial, Helvetica, sans-serif`;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    if ('letterSpacing' in context) context.letterSpacing = `${size * -0.055}px`;
  };
  function cancel(g) {
    g.animation?.cancel();
    g.animation = undefined;
    g.element.style.willChange = '';
  }
  function animate(g, frames, options) {
    cancel(g);
    g.element.style.willChange = 'transform, opacity';
    const animation = g.element.animate(frames, options);
    g.animation = animation;
    void animation.finished
      .catch(() => {})
      .then(() => {
        if (g.animation === animation) {
          cancel(g);
          if (g.target === 0) g.element.style.transform = '';
        }
      });
  }
  function lift(g, target) {
    g.target = target;
    // Read only the active glyph on a pointer boundary, never on every animation frame.
    const transform = getComputedStyle(g.element).transform;
    const y = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
    g.element.style.transform = `translate3d(0, ${target}px, 0)`;
    g.element.style.opacity = '1';
    animate(
      g,
      spring.map((value) => ({ transform: `translate3d(0, ${y + (target - y) * value}px, 0)` })),
      { duration: 1000, easing: 'linear' },
    );
  }
  function layout() {
    const width = container.clientWidth,
      height = container.clientHeight;
    if (!width || !height || !alive) return;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    const key = [width, height, ratio, getComputedStyle(container).fontSize].join(':');
    if (key === layoutKey) return;
    layoutKey = key;
    let size = parseFloat(getComputedStyle(container).fontSize) || 150;
    font(probe, size);
    let m = probe.measureText(TEXT);
    size *= Math.min(
      1,
      (width * 0.9) / Math.max(1, m.actualBoundingBoxLeft + m.actualBoundingBoxRight),
      (height * 0.66) / Math.max(1, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent),
    );
    font(probe, size);
    m = probe.measureText(TEXT);
    const x =
      (width - m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2 + m.actualBoundingBoxLeft;
    const baseline =
      (height - m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 +
      m.actualBoundingBoxAscent;
    const next = [],
      fragment = document.createDocumentFragment();
    let prefix = '';
    for (const [index, char] of Array.from(TEXT).entries()) {
      prefix += char;
      if (!char.trim()) continue;
      const own = probe.measureText(char),
        gx = x + probe.measureText(prefix).width - own.width;
      const box = {
        x1: gx - own.actualBoundingBoxLeft,
        x2: gx + own.actualBoundingBoxRight,
        y1: baseline - own.actualBoundingBoxAscent,
        y2: baseline + own.actualBoundingBoxDescent,
      };
      const element = document.createElement('span');
      element.className = 'energy-tech-glyph';
      element.dataset.letter = String(index);
      Object.assign(element.style, {
        left: `${box.x1 - 4}px`,
        top: `${box.y1 - 4}px`,
        width: `${box.x2 - box.x1 + 8}px`,
        height: `${box.y2 - box.y1 + 8}px`,
      });
      for (const outline of [false, true]) {
        const art = document.createElement('canvas');
        art.className = outline ? 'energy-letter-outline' : 'energy-letter-fill';
        art.width = Math.ceil((box.x2 - box.x1 + 8) * ratio);
        art.height = Math.ceil((box.y2 - box.y1 + 8) * ratio);
        const ctx = art.getContext('2d');
        if (!ctx) throw Error('Canvas unavailable');
        ctx.scale(ratio, ratio);
        font(ctx, size);
        ctx.fillStyle = ctx.strokeStyle = '#f5f5f3';
        ctx.lineWidth = 1.1;
        ctx.setLineDash([3, 2]);
        ctx[outline ? 'strokeText' : 'fillText'](
          char,
          4 + own.actualBoundingBoxLeft,
          4 + own.actualBoundingBoxAscent,
        );
        element.append(art);
      }
      fragment.append(element);
      next.push({ index, box, element, lift: Math.min(14, size * 0.075) });
    }
    glyphs.forEach(cancel);
    glyphs = next;
    host.replaceChildren(fragment);
    hover = -1;
    delete container.dataset.activeLetter;
    container.dataset.ready = 'true';
    if (!entered && allowed() && visible) {
      glyphs.forEach((g, order) =>
        animate(
          g,
          [
            { opacity: 0, transform: 'translate3d(0, 24px, 0)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0)' },
          ],
          {
            duration: 650,
            delay: order * 32,
            easing: 'cubic-bezier(.16,1,.3,1)',
            fill: 'backwards',
          },
        ),
      );
    }
    entered = true;
  }
  function setHover(next) {
    if (next === hover) return;
    const previous = glyphs.find((g) => g.index === hover);
    if (previous) {
      delete previous.element.dataset.hover;
      lift(previous, 0);
    }
    hover = next;
    if (next < 0) delete container.dataset.activeLetter;
    else {
      container.dataset.activeLetter = String(next);
      const g = glyphs.find((item) => item.index === next);
      g.element.dataset.hover = 'true';
      lift(g, -g.lift);
    }
  }
  function move(event) {
    if (!alive || !allowed() || !visible || event.pointerType === 'touch') return leave();
    const rect = container.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    let closest,
      distance = Infinity;
    for (const g of glyphs) {
      if (x < g.box.x1 || x > g.box.x2 || y < g.box.y1 || y > g.box.y2) continue;
      const delta = Math.abs((g.box.x1 + g.box.x2) / 2 - x);
      if (delta < distance) {
        closest = g;
        distance = delta;
      }
    }
    setHover(closest?.index ?? -1);
  }
  function leave() {
    setHover(-1);
  }
  function sync() {
    if (!alive) return;
    if (!allowed() || !visible) {
      hover = -1;
      delete container.dataset.activeLetter;
      glyphs.forEach((g) => {
        cancel(g);
        delete g.element.dataset.hover;
        g.element.style.transform = '';
        g.element.style.opacity = '1';
      });
    }
  }
  const resize = new ResizeObserver(() => {
    try {
      layout();
    } catch {
      destroy();
    }
  });
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  resize.observe(container);
  intersection.observe(container);
  container.addEventListener('pointermove', move, { passive: true });
  container.addEventListener('pointerleave', leave);
  window.addEventListener('blur', leave);
  function destroy() {
    if (!alive) return;
    alive = false;
    glyphs.forEach(cancel);
    glyphs = [];
    host.replaceChildren();
    resize.disconnect();
    intersection.disconnect();
    container.removeEventListener('pointermove', move);
    container.removeEventListener('pointerleave', leave);
    window.removeEventListener('blur', leave);
    delete container.dataset.ready;
    delete container.dataset.activeLetter;
  }
  try {
    layout();
  } catch {
    destroy();
    return;
  }
  if (document.fonts)
    void document.fonts.ready.then(() => {
      if (alive) {
        try {
          layout();
        } catch {
          destroy();
        }
      }
    });
  return { sync, destroy };
}
