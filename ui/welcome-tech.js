/* Adapted for this website from React Bits Tech Text and Split Text,
 * copyright (c) 2026 David Haz.
 * https://github.com/DavidHDev/react-bits/tree/e12c22192ac7b4b452c5e2feb9b586d74765d696
 * MIT + Commons Clause License Condition v1.0: /asset/licenses/react-bits.txt
 * Fixed wordmark, strict character bounds and Canvas spring rendering replace React/GSAP.
 */
const TEXT = 'Energy Record';
const clamp = (x) => Math.min(1, Math.max(0, x));
export function createTechText(container, canvas, allowed) {
  if (typeof ResizeObserver !== 'function' || typeof IntersectionObserver !== 'function') return;
  let ctx, probe;
  try {
    ctx = canvas.getContext('2d');
    probe = document.createElement('canvas').getContext('2d');
  } catch {
    return;
  }
  if (!ctx || !probe) return;
  let width = 0,
    height = 0,
    ratio = 1,
    glyphs = [],
    hover = -1,
    raf = 0,
    last = 0,
    clock = 0;
  let visible = true,
    alive = true;
  const font = (context, size) => {
    context.font = `700 ${size}px Arial, Helvetica, sans-serif`;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    if ('letterSpacing' in context) context.letterSpacing = `${size * -0.055}px`;
  };
  function layout() {
    width = container.clientWidth;
    height = container.clientHeight;
    if (!width || !height || !alive) return;
    ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
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
    let prefix = '';
    glyphs = Array.from(TEXT).flatMap((char, index) => {
      prefix += char;
      if (!char.trim()) return [];
      const own = probe.measureText(char);
      const gx = x + probe.measureText(prefix).width - own.width;
      const box = {
        x1: gx - own.actualBoundingBoxLeft,
        x2: gx + own.actualBoundingBoxRight,
        y1: baseline - own.actualBoundingBoxAscent,
        y2: baseline + own.actualBoundingBoxDescent,
      };
      const art = (outline) => {
        const image = document.createElement('canvas'),
          pad = 4;
        image.width = Math.ceil((box.x2 - box.x1 + pad * 2) * ratio);
        image.height = Math.ceil((box.y2 - box.y1 + pad * 2) * ratio);
        const c = image.getContext('2d');
        if (!c) throw Error('Canvas unavailable');
        c.scale(ratio, ratio);
        font(c, size);
        c.fillStyle = c.strokeStyle = '#f5f5f3';
        c.lineWidth = 1.1;
        c.setLineDash([3, 2]);
        c[outline ? 'strokeText' : 'fillText'](
          char,
          pad + own.actualBoundingBoxLeft,
          pad + own.actualBoundingBoxAscent,
        );
        return image;
      };
      return [
        {
          index,
          box,
          left: box.x1 - 4,
          top: box.y1 - 4,
          fill: art(false),
          outline: art(true),
          y: 0,
          v: 0,
          lift: Math.min(14, size * 0.075),
        },
      ];
    });
    hover = -1;
    if (!allowed()) clock = 1.1;
    delete container.dataset.activeLetter;
    draw();
    wake();
  }
  function draw() {
    if (!alive || !width || !height) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const [order, g] of glyphs.entries()) {
      const progress = clamp((clock - order * 0.032) / 0.65),
        eased = 1 - Math.pow(1 - progress, 3);
      ctx.globalAlpha = progress;
      ctx.drawImage(
        g.index === hover ? g.outline : g.fill,
        Math.round(g.left * ratio),
        Math.round((g.top + g.y + (1 - eased) * 24) * ratio),
      );
    }
    ctx.globalAlpha = 1;
    container.dataset.ready = 'true';
  }
  function step(now) {
    raf = 0;
    if (!alive || !visible || !allowed()) return;
    if (last && now - last < 1000 / 30) {
      raf = requestAnimationFrame(step);
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 30;
    last = now;
    clock += dt;
    let moving = clock < 1.1;
    const steps = Math.ceil(dt / (1 / 120)),
      h = dt / steps;
    for (const g of glyphs) {
      const target = g.index === hover ? -g.lift : 0;
      for (let i = 0; i < steps; i++) {
        g.v += (180 * (target - g.y) - 19 * g.v) * h;
        g.y += g.v * h;
      }
      if (Math.abs(g.y - target) < 0.02 && Math.abs(g.v) < 0.05) {
        g.y = target;
        g.v = 0;
      } else moving = true;
    }
    try {
      draw();
    } catch {
      destroy();
      return;
    }
    if (moving) raf = requestAnimationFrame(step);
  }
  function wake() {
    if (!raf && alive && visible && allowed()) {
      last = 0;
      raf = requestAnimationFrame(step);
    }
  }
  function setHover(next) {
    if (next === hover) return;
    hover = next;
    if (next < 0) delete container.dataset.activeLetter;
    else container.dataset.activeLetter = String(next);
    draw();
    wake();
  }
  function move(event) {
    if (!allowed() || event.pointerType === 'touch') {
      setHover(-1);
      return;
    }
    const rect = container.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    const candidates = glyphs.filter(
      (g) => x >= g.box.x1 && x <= g.box.x2 && y >= g.box.y1 && y <= g.box.y2,
    );
    candidates.sort(
      (a, b) => Math.abs((a.box.x1 + a.box.x2) / 2 - x) - Math.abs((b.box.x1 + b.box.x2) / 2 - x),
    );
    setHover(candidates[0]?.index ?? -1);
  }
  const leave = () => setHover(-1);
  function sync() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    if (!allowed()) {
      clock = 1.1;
      for (const g of glyphs) g.y = g.v = 0;
    }
    leave();
    draw();
    if (allowed() && visible) wake();
  }
  const resize = new ResizeObserver(() => {
    try {
      layout();
    } catch {
      destroy();
    }
  });
  resize.observe(container);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  intersection.observe(container);
  container.addEventListener('pointermove', move, { passive: true });
  container.addEventListener('pointerleave', leave);
  window.addEventListener('blur', leave);
  function destroy() {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    resize.disconnect();
    intersection.disconnect();
    container.removeEventListener('pointermove', move);
    container.removeEventListener('pointerleave', leave);
    window.removeEventListener('blur', leave);
    delete container.dataset.ready;
    delete container.dataset.activeLetter;
    glyphs = [];
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
