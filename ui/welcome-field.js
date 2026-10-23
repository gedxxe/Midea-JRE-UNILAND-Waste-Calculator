// Decorative canvas only. No account, reading, storage or network access.
export function createWelcomeField(scene) {
  const canvas = scene.querySelector('canvas');
  let context;
  try {
    context = canvas?.getContext('2d');
  } catch {
    /* Decoration is optional. */
  }
  if (!context) return { sync() {}, replay() {} };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');
  let width = 0,
    height = 0,
    frame = 0,
    last = 0,
    elapsed = 0,
    time = 0;
  let intersecting = true,
    pointerX = 0,
    pointerY = 0,
    targetX = 0,
    targetY = 0;
  const noise = (n) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const points = Array.from({ length: 520 }, (_, i) => ({
    angle: i * 2.399963,
    ring: noise(i + 1) * Math.PI * 2,
    spread: Math.sqrt(noise(i + 8)),
    size: 0.55 + noise(i + 17) * 1.15,
  }));
  function draw() {
    if (!width || !height) return;
    context.clearRect(0, 0, width, height);
    const radius = Math.min(width * 0.34, height * 0.47);
    const tilt = -0.32 + Math.sin(time * 0.13) * 0.16 + pointerY * 0.06;
    const count = width < 420 ? 240 : points.length;
    for (let i = 0; i < count; i++) {
      const p = points[i],
        angle = p.angle + time * 0.095;
      const r = radius * (1 + Math.cos(p.ring + time * 0.12) * p.spread * 0.32);
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r * 0.58;
      const z = Math.sin(p.ring) * radius * 0.45 + Math.sin(angle * 2 + time * 0.2) * radius * 0.1;
      const yy = y * Math.cos(tilt) - z * Math.sin(tilt);
      const depth = (z / radius + 0.65) / 1.3;
      const size = p.size * (0.65 + depth * 0.65);
      context.fillStyle = i % 5 === 0 ? '#54758c' : i % 3 === 0 ? '#38bada' : '#008fcb';
      context.globalAlpha = 0.2 + depth * 0.55;
      context.fillRect(width / 2 + x + pointerX * 9, height / 2 + yy + pointerY * 7, size, size);
    }
    context.globalAlpha = 1;
  }
  function active() {
    return (
      document.body.classList.contains('login-page') &&
      document.body.dataset.welcome !== 'hero' &&
      !document.hidden &&
      intersecting &&
      scene.dataset.motion === 'on' &&
      scene.dataset.paused !== 'true' &&
      !reduced.matches
    );
  }
  function step(now) {
    frame = 0;
    if (!active()) return;
    elapsed += last ? Math.min(now - last, 50) : 0;
    last = now;
    if (elapsed >= 1000 / 30) {
      time += elapsed / 1000;
      elapsed = 0;
      pointerX += (targetX - pointerX) * 0.08;
      pointerY += (targetY - pointerY) * 0.08;
      draw();
    }
    frame = requestAnimationFrame(step);
  }
  function sync() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    elapsed = 0;
    if (active() && width && height) frame = requestAnimationFrame(step);
    else if (document.body.classList.contains('login-page')) draw();
  }
  function resize() {
    const box = scene.getBoundingClientRect();
    width = Math.round(box.width);
    height = Math.round(box.height);
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
    sync();
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(scene);
  else window.addEventListener('resize', resize, { passive: true });
  if (typeof IntersectionObserver === 'function')
    new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      sync();
    }).observe(scene);
  const changes = new MutationObserver(sync);
  changes.observe(scene, { attributes: true, attributeFilter: ['data-motion', 'data-paused'] });
  changes.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-welcome'] });
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  scene.addEventListener(
    'pointermove',
    (event) => {
      if (!fine.matches || !active()) return;
      const box = scene.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1));
      targetY = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1));
    },
    { passive: true },
  );
  scene.addEventListener('pointerleave', () => {
    targetX = 0;
    targetY = 0;
  });
  resize();
  return {
    sync,
    replay() {
      time = 0;
      pointerX = pointerY = targetX = targetY = 0;
      draw();
      sync();
    },
  };
}
