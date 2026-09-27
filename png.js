// PNG pHYs uses pixels per metre. The pixel dimensions remain unchanged.
export function pngResolution(bytes, dpi = 400) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((v, i) => bytes[i] === v) || !Number.isFinite(dpi) || dpi <= 0 || dpi > 1200)
    throw new Error('Invalid PNG resolution');
  const chunk = new Uint8Array(21),
    view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  const pixelsPerMetre = Math.round(dpi / 0.0254);
  view.setUint32(8, pixelsPerMetre);
  view.setUint32(12, pixelsPerMetre);
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  const parts = [bytes.subarray(0, 8)];
  let offset = 8,
    inserted = false,
    ended = false;
  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    if (offset + length + 12 > bytes.length) throw new Error('Invalid PNG chunk');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === 'IDAT' && !inserted) {
      parts.push(chunk);
      inserted = true;
    }
    if (type !== 'pHYs') parts.push(bytes.subarray(offset, offset + length + 12));
    offset += length + 12;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!inserted || !ended || offset !== bytes.length) throw new Error('Incomplete PNG');
  const output = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let position = 0;
  for (const part of parts) {
    output.set(part, position);
    position += part.length;
  }
  return output;
}
