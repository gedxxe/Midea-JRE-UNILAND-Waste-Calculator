/* Adapted for this website from React Bits Magnet, copyright (c) 2026 David Haz.
 * https://github.com/DavidHDev/react-bits/tree/e12c22192ac7b4b452c5e2feb9b586d74765d696
 * MIT + Commons Clause License Condition v1.0: /asset/licenses/react-bits.txt
 * One bounded DOM button; no global component registry or React runtime.
 */
export function createWelcomeMagnet(button, allowed) {
  const inner = button.firstElementChild;
  let raf = 0,
    last = 0,
    pointer;
  const current = { x: 0, y: 0 },
    velocity = { x: 0, y: 0 };
  function frame(now) {
    raf = 0;
    if (!allowed()) {
      reset();
      return;
    }
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    const rect = button.getBoundingClientRect();
    const target = { x: 0, y: 0 };
    if (pointer) {
      const dx = pointer.x - rect.left - rect.width / 2;
      const dy = pointer.y - rect.top - rect.height / 2;
      if (Math.abs(dx) < rect.width / 2 + 38 && Math.abs(dy) < rect.height / 2 + 38) {
        const length = Math.max(1, Math.hypot(dx / 5, dy / 5) / 10);
        target.x = dx / 5 / length;
        target.y = dy / 5 / length;
      }
    }
    const steps = Math.ceil(dt / (1 / 120));
    let resting = true;
    for (let i = 0; i < steps; i++)
      for (const key of ['x', 'y']) {
        const h = dt / steps;
        velocity[key] += (170 * (target[key] - current[key]) - 16 * velocity[key]) * h;
        current[key] += velocity[key] * h;
        if (Math.abs(current[key] - target[key]) > 0.01 || Math.abs(velocity[key]) > 0.05)
          resting = false;
      }
    if (resting)
      for (const key of ['x', 'y']) {
        current[key] = target[key];
        velocity[key] = 0;
      }
    const limit = Math.max(1, Math.hypot(current.x, current.y) / 10);
    inner.style.transform = `translate3d(${(current.x / limit).toFixed(2)}px, ${(current.y / limit).toFixed(2)}px, 0)`;
    if (!resting) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  function wake() {
    if (!raf && allowed()) raf = requestAnimationFrame(frame);
  }
  function move(event) {
    if (event.pointerType !== 'mouse' || !allowed()) return;
    pointer = { x: event.clientX, y: event.clientY };
    wake();
  }
  function leave() {
    pointer = undefined;
    wake();
  }
  function reset() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    pointer = undefined;
    current.x = current.y = velocity.x = velocity.y = 0;
    inner.style.transform = '';
  }
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('blur', leave);
  document.addEventListener('pointerleave', leave);
  return {
    sync() {
      if (!allowed()) reset();
    },
    destroy() {
      reset();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', leave);
      document.removeEventListener('pointerleave', leave);
    },
  };
}
