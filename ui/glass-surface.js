/* React Bits GlassSurface SVG/frosted paths, copyright (c) 2026 David Haz.
 * Adapted from the user-supplied component; /asset/licenses/react-bits.txt.
 * Geometry only: no screenshots, canvas/video backdrop, form data or animation loop.
 */
const NS = 'http://www.w3.org/2000/svg';
const svgNode = (tag, attributes = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
};
let count = 0;
export function createGlassSurface(element) {
  if (!element || typeof ResizeObserver !== 'function') return { destroy() {} };
  const id = 'energy-glass-' + ++count;
  const svg = svgNode('svg', {
    class: 'glass-filter-defs',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const defs = svgNode('defs'),
    filter = svgNode('filter', {
      id,
      x: '0%',
      y: '0%',
      width: '100%',
      height: '100%',
      'color-interpolation-filters': 'sRGB',
    });
  const map = svgNode('feImage', {
    x: 0,
    y: 0,
    width: '100%',
    height: '100%',
    preserveAspectRatio: 'none',
    result: 'map',
  });
  filter.append(map);
  for (const [index, name] of ['red', 'green', 'blue'].entries()) {
    filter.append(
      svgNode('feDisplacementMap', {
        in: 'SourceGraphic',
        in2: 'map',
        scale: -100 + index * 10,
        xChannelSelector: 'R',
        yChannelSelector: 'G',
        result: 'displaced-' + name,
      }),
    );
    const matrix = Array.from({ length: 20 }, () => 0);
    matrix[index * 5 + index] = 1;
    matrix[18] = 1;
    filter.append(
      svgNode('feColorMatrix', {
        in: 'displaced-' + name,
        type: 'matrix',
        values: matrix.join(' '),
        result: name,
      }),
    );
  }
  filter.append(
    svgNode('feBlend', { in: 'red', in2: 'green', mode: 'screen', result: 'rg' }),
    svgNode('feBlend', { in: 'rg', in2: 'blue', mode: 'screen', result: 'output' }),
    svgNode('feGaussianBlur', { in: 'output', stdDeviation: 0.7 }),
  );
  defs.append(filter);
  svg.append(defs);
  element.prepend(svg);
  element.classList.add('energy-glass');
  const probe = document.createElement('div');
  probe.style.backdropFilter = 'url(#' + id + ')';
  const supported =
    !!probe.style.backdropFilter && !/Firefox|Version\/.*Safari/.test(navigator.userAgent);
  let alive = true,
    url,
    signature = '',
    image,
    sequence = 0;
  function update() {
    if (!alive || !supported) return;
    const w = element.offsetWidth,
      h = element.offsetHeight;
    if (!w || !h) return;
    const radius = parseFloat(getComputedStyle(element).borderRadius) || 28;
    const key = [w, h, radius].join(':');
    if (key === signature) return;
    signature = key;
    const edge = Math.min(w, h) * 0.035;
    // Same rectangular displacement map as upstream, using an owned blob for the existing CSP.
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="red" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient><linearGradient id="blue" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient><filter id="soft" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="11"/></filter></defs><rect width="100%" height="100%" fill="black"/><rect width="100%" height="100%" rx="${radius}" fill="url(#red)"/><rect width="100%" height="100%" rx="${radius}" fill="url(#blue)" style="mix-blend-mode:difference"/><rect x="${edge}" y="${edge}" width="${Math.max(1, w - edge * 2)}" height="${Math.max(1, h - edge * 2)}" rx="${radius}" fill="hsl(0 0% 50% / .93)" filter="url(#soft)"/></svg>`;
    const next = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
    const token = ++sequence,
      previous = url;
    url = next;
    if (image) image.onload = image.onerror = null;
    image = new Image();
    image.onload = () => {
      if (!alive || token !== sequence) return;
      map.setAttribute('href', next);
      element.style.setProperty('--glass-filter', 'url(#' + id + ')');
      element.dataset.glass = 'svg';
    };
    image.onerror = () => {
      if (alive && token === sequence) {
        delete element.dataset.glass;
        element.style.removeProperty('--glass-filter');
      }
    };
    image.src = next;
    if (previous) URL.revokeObjectURL(previous);
  }
  const observer = new ResizeObserver(() => {
    try {
      update();
    } catch {
      /* Frosted fallback stays usable. */
    }
  });
  observer.observe(element);
  try {
    update();
  } catch {
    /* Optional refraction. */
  }
  return {
    destroy() {
      if (!alive) return;
      alive = false;
      sequence++;
      observer.disconnect();
      if (image) image.onload = image.onerror = null;
      if (url) URL.revokeObjectURL(url);
      svg.remove();
      element.classList.remove('energy-glass');
      delete element.dataset.glass;
      element.style.removeProperty('--glass-filter');
    },
  };
}
