// Adapted from React Bits SpecularButton, David Haz. See asset/licenses/react-bits.txt.
const PAD = 24;
const TAU = Math.PI * 2;

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform float uRadius;
uniform float uPx;
uniform float uSpot;
uniform vec2 uEntry;
uniform vec3 uLineColor;
uniform vec3 uBaseColor;
uniform float uIntensity;
uniform vec2 uWindow;
uniform float uThickness;
uniform float uGlow;
out vec4 outColor;

float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float loopPosition(vec2 p, vec2 b, float r) {
  vec2 inner = b - r;
  float arc = 1.5707963 * r;
  float quarter = inner.x + inner.y + arc;
  vec2 a = abs(p);
  vec2 q = a - inner;
  float s = q.x > 0.0 && q.y > 0.0
    ? inner.y + atan(q.y, q.x) * r
    : (q.x > q.y ? min(a.y, inner.y) : inner.y + arc + inner.x - min(a.x, inner.x));
  if (p.x < 0.0) s = p.y >= 0.0 ? 2.0 * quarter - s : 2.0 * quarter + s;
  else if (p.y < 0.0) s = 4.0 * quarter - s;
  return s / max(4.0 * quarter, 0.0001);
}

float lobe(float position, float center) {
  float gap = abs(fract(position - center + 0.5) - 0.5);
  return 1.0 - smoothstep(uWindow.x, uWindow.x + uWindow.y, gap);
}

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float d = roundedBox(p, uHalf, uRadius);
  float position = loopPosition(p, uHalf, uRadius);
  float key = lobe(position, uSpot);
  float back = lobe(position, uSpot + 0.5);
  float streak = key + back * 0.45;
  float width = max(uThickness * uPx * mix(1.0, max(key, back), 0.6), 0.35);
  float band = smoothstep(-width - 0.6, -width + 0.6, d) * (1.0 - smoothstep(-0.6, 0.6, d));
  float hair = smoothstep(-uPx - 0.6, -uPx + 0.6, d) * (1.0 - smoothstep(-0.6, 0.6, d));
  float inside = 1.0 - smoothstep(-0.6, 0.6, d);
  vec2 pool = (p - uEntry) / (uHalf.y * vec2(1.6, 1.1));
  float glow = streak * 0.2 * exp(-abs(d + width * 0.5) / (5.0 * uPx)) + inside * 0.08 * exp(-dot(pool, pool));
  float light = clamp((band * streak + glow * uGlow) * uIntensity, 0.0, 1.0);
  vec4 base = vec4(uBaseColor, 1.0) * hair * 0.6;
  outColor = vec4(uLineColor, 1.0) * light + base * (1.0 - light);
}`;

const UNIFORMS = [
  'uCenter',
  'uHalf',
  'uRadius',
  'uPx',
  'uSpot',
  'uEntry',
  'uLineColor',
  'uBaseColor',
  'uIntensity',
  'uWindow',
  'uThickness',
  'uGlow',
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const wrap = (value) => value - Math.floor(value);

const loopPosition = (x, y, halfX, halfY, r) => {
  const innerX = halfX - r;
  const innerY = halfY - r;
  const arc = (Math.PI / 2) * r;
  const quarter = innerX + innerY + arc;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const qx = ax - innerX;
  const qy = ay - innerY;
  let s;
  if (qx > 0 && qy > 0) s = innerY + Math.atan2(qy, qx) * r;
  else if (qx > qy) s = Math.min(ay, innerY);
  else s = innerY + arc + innerX - Math.min(ax, innerX);
  if (x < 0) s = y >= 0 ? 2 * quarter - s : 2 * quarter + s;
  else if (y < 0) s = 4 * quarter - s;
  return wrap(s / Math.max(4 * quarter, 0.0001));
};

const rimPoint = (position, halfX, halfY, r) => {
  const innerX = halfX - r;
  const innerY = halfY - r;
  const arc = (Math.PI / 2) * r;
  const quarter = innerX + innerY + arc;
  let s = wrap(position) * 4 * quarter;
  let signX = 1;
  let signY = 1;
  if (s > 3 * quarter) {
    s = 4 * quarter - s;
    signY = -1;
  } else if (s > 2 * quarter) {
    s -= 2 * quarter;
    signX = -1;
    signY = -1;
  } else if (s > quarter) {
    s = 2 * quarter - s;
    signX = -1;
  }
  let x = innerX - (s - innerY - arc);
  let y = halfY;
  if (s <= innerY) {
    x = halfX;
    y = s;
  } else if (s <= innerY + arc) {
    const angle = (s - innerY) / Math.max(r, 0.0001);
    x = innerX + Math.cos(angle) * r;
    y = innerY + Math.sin(angle) * r;
  }
  return [x * signX, y * signY];
};

const compile = (gl, type, source) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
};

const link = (gl) => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  gl.deleteProgram(program);
  return null;
};

// Optional edge light only. Native form submission never depends on this module.
export function createSpecularButton(button, allowed, { radius: corner = 32 } = {}) {
  if (typeof ResizeObserver !== 'function' || typeof IntersectionObserver !== 'function')
    return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'specular-button__light';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl) return null;
  const program = link(gl);
  if (!program) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }
  const uniforms = Object.fromEntries(
    UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
  );
  const buffer = gl.createBuffer(),
    vao = gl.createVertexArray();
  if (!buffer || !vao) {
    gl.deleteBuffer(buffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  button.prepend(canvas);
  const s = {
    radius: corner,
    intensity: 1.1,
    idleIntensity: 0.35,
    shineSize: 12,
    shineFade: 34,
    thickness: 1.5,
    glow: 0.3,
    proximity: 180,
  };
  const view = { width: 1, height: 1, ratio: 1 },
    pointer = { known: false, x: 0, y: 0 },
    state = { spot: 0, level: s.idleIntensity, press: 0, ready: false };
  let raf = 0,
    last = 0,
    visible = false,
    destroyed = false;
  const active = () =>
    !destroyed &&
    visible &&
    allowed() &&
    !button.disabled &&
    !button.closest('[hidden], [inert]') &&
    !gl.isContextLost();
  const radius = () => Math.min(s.radius, view.width / 2, view.height / 2);
  const restSpot = () => {
    const inset = radius() * (1 - Math.SQRT1_2);
    return loopPosition(
      inset - view.width / 2,
      view.height / 2 - inset,
      view.width / 2,
      view.height / 2,
      radius(),
    );
  };
  function aim() {
    if (!pointer.known) return null;
    const rect = button.getBoundingClientRect(),
      scale = rect.width / view.width || 1;
    const halfX = view.width / 2,
      halfY = view.height / 2;
    const x = (pointer.x - rect.left - rect.width / 2) / scale,
      y = (rect.top + rect.height / 2 - pointer.y) / scale;
    const distance = Math.hypot(Math.max(Math.abs(x) - halfX, 0), Math.max(Math.abs(y) - halfY, 0));
    const t = clamp(1 - distance / s.proximity, 0, 1),
      near = t * t * (3 - 2 * t);
    const nearest = loopPosition(x, y, halfX, halfY, radius());
    if (distance > 0) return { spot: nearest, near };
    const depth = clamp(Math.min(halfX - Math.abs(x), halfY - Math.abs(y)) / (halfY * 0.8), 0, 1);
    const sway = restSpot() - (x / halfX) * 0.06 - (y / halfY) * 0.02;
    const offset = sway - nearest - Math.round(sway - nearest);
    return { spot: wrap(nearest + offset * depth * depth * (3 - 2 * depth)), near };
  }
  function draw() {
    const { width, height } = view,
      scaleX = canvas.width / (width + PAD * 2),
      scaleY = canvas.height / (height + PAD * 2);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform2f(uniforms.uCenter, (PAD + width / 2) * scaleX, (PAD + height / 2) * scaleY);
    gl.uniform2f(uniforms.uHalf, (width / 2) * scaleX, (height / 2) * scaleY);
    gl.uniform1f(uniforms.uRadius, radius() * scaleX);
    gl.uniform1f(uniforms.uPx, view.ratio);
    const [rimX, rimY] = rimPoint(state.spot, width / 2, height / 2, radius());
    const pull =
      1 -
      Math.min((0.35 * height) / 2, Math.hypot(rimX, rimY)) /
        Math.max(Math.hypot(rimX, rimY), 0.0001);
    gl.uniform1f(uniforms.uSpot, state.spot);
    gl.uniform2f(uniforms.uEntry, rimX * pull * scaleX, rimY * pull * scaleY);
    gl.uniform3fv(uniforms.uLineColor, [0.7, 0.94, 1]);
    gl.uniform3fv(uniforms.uBaseColor, [0.24, 0.48, 0.57]);
    gl.uniform1f(uniforms.uIntensity, s.intensity * (state.level + state.press * 0.8));
    gl.uniform2f(
      uniforms.uWindow,
      s.shineSize / 360 + state.press * 0.06,
      s.shineFade / 360 + 0.0001,
    );
    gl.uniform1f(uniforms.uThickness, s.thickness);
    gl.uniform1f(uniforms.uGlow, s.glow);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    canvas.hidden = true;
    pointer.known = false;
  }
  function frame(now) {
    raf = 0;
    if (!active()) {
      stop();
      return;
    }
    canvas.hidden = false;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!state.ready) {
      state.spot = restSpot();
      state.ready = true;
    }
    const target = aim(),
      steering = target && target.near > 0;
    let diff = (steering ? target.spot : restSpot()) - state.spot;
    diff -= Math.round(diff);
    state.spot = wrap(state.spot + diff * (1 - Math.exp(-dt * 8)));
    const level = s.idleIntensity + (1 - s.idleIntensity) * (target?.near || 0);
    state.level += (level - state.level) * (1 - Math.exp(-dt * 7));
    state.press *= Math.exp(-dt * 5);
    draw();
    if (Math.abs(diff) > 0.0002 || Math.abs(level - state.level) > 0.001 || state.press > 0.002)
      raf = requestAnimationFrame(frame);
    else last = 0;
  }
  function sync() {
    if (!active()) stop();
    else if (!raf) raf = requestAnimationFrame(frame);
  }
  function measure() {
    view.width = Math.max(1, button.offsetWidth);
    view.height = Math.max(1, button.offsetHeight);
    view.ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round((view.width + PAD * 2) * view.ratio));
    canvas.height = Math.max(1, Math.round((view.height + PAD * 2) * view.ratio));
    sync();
  }
  const move = (event) => {
    if (!active()) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.known = true;
    sync();
  };
  const down = (event) => {
    move(event);
    if (active()) {
      state.press = 1;
      sync();
    }
  };
  const leave = () => {
    pointer.known = false;
    sync();
  };
  const end = (event) => {
    if (event.pointerType !== 'mouse') leave();
  };
  const lost = (event) => {
    event.preventDefault();
    stop();
  };
  const resize = new ResizeObserver(measure);
  resize.observe(button);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    sync();
  });
  intersection.observe(button);
  const disabled = new MutationObserver(sync);
  disabled.observe(button, { attributes: true, attributeFilter: ['disabled'] });
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', end, { passive: true });
  window.addEventListener('pointercancel', end, { passive: true });
  document.documentElement.addEventListener('pointerleave', leave);
  button.addEventListener('pointerdown', down);
  canvas.addEventListener('webglcontextlost', lost);
  measure();
  return {
    sync,
    destroy() {
      if (destroyed) return;
      stop();
      destroyed = true;
      resize.disconnect();
      intersection.disconnect();
      disabled.disconnect();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      document.documentElement.removeEventListener('pointerleave', leave);
      button.removeEventListener('pointerdown', down);
      canvas.removeEventListener('webglcontextlost', lost);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
}
