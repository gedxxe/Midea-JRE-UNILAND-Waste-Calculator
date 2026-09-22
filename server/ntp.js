import dgram from 'node:dgram';
import { randomBytes } from 'node:crypto';

const EPOCH = 2208988800;
const ERA = 2 ** 32;
export function writeTimestamp(buffer, offset, unixMs) {
  const seconds = unixMs / 1000 + EPOCH;
  buffer.writeUInt32BE(Math.floor(seconds) % ERA, offset);
  buffer.writeUInt32BE(Math.floor((seconds - Math.floor(seconds)) * ERA), offset + 4);
}
export function readTimestamp(buffer, offset, referenceMs) {
  const seconds = buffer.readUInt32BE(offset);
  const fraction = buffer.readUInt32BE(offset + 4) / ERA;
  const reference = referenceMs / 1000 + EPOCH;
  const era = Math.round((reference - seconds) / ERA);
  return (seconds + era * ERA + fraction - EPOCH) * 1000;
}
export function decodeReply(reply, request, elapsedMs, referenceMs = Date.now()) {
  if (reply.length < 48 || !reply.subarray(24,32).equals(request.subarray(40,48))) throw new Error('NTP response does not match the request.');
  const leap = reply[0] >> 6;
  const version = (reply[0] >> 3) & 7;
  const mode = reply[0] & 7;
  if (leap === 3 || ![3,4].includes(version) || mode !== 4 || reply[1] < 1 || reply[1] > 15) throw new Error('NTP server is not synchronized.');
  if (reply.subarray(32,40).every(b => b === 0) || reply.subarray(40,48).every(b => b === 0)) throw new Error('NTP timestamps missing.');
  const received = readTimestamp(reply,32,referenceMs);
  const transmitted = readTimestamp(reply,40,referenceMs);
  const processing = transmitted - received;
  const dispersionMs = reply.readUInt32BE(8) / 65536 * 1000;
  const rootDelayMs = Math.max(0, reply.readInt32BE(4) / 65536 * 1000);
  if (processing < -1 || processing > elapsedMs + 2 || elapsedMs < 0 || elapsedMs > 2000 || dispersionMs > 10000) throw new Error('NTP sample quality is insufficient.');
  const networkDelay = Math.max(0, elapsedMs - processing);
  return { unixMs: transmitted + networkDelay / 2, uncertaintyMs: networkDelay / 2 + rootDelayMs / 2 + dispersionMs + 1, stratum: reply[1] };
}
export function queryNtp(host, { timeoutMs = 1600, port = 123 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const request = Buffer.alloc(48);
    request[0] = 0x23; // NTP v4, client mode
    let done = false;
    let sentAt;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* socket may not have bound after a DNS failure */ }
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('NTP timeout.')), timeoutMs);
    socket.once('error', error => finish(error));
    socket.once('message', message => {
      const at = performance.now();
      try { finish(null, {...decodeReply(message, request, at - sentAt), at, source: host}); }
      catch (error) { finish(error); }
    });
    socket.connect(port, host, () => {
      if (done) return;
      writeTimestamp(request,40,Date.now());
      randomBytes(2).copy(request,46);
      sentAt = performance.now();
      socket.send(request, error => { if (error) finish(error); });
    });
  });
}

export function createTimeService({ query = queryNtp, monotonic = () => performance.now() } = {}) {
  let cached;
  let pending;
  let failedAt = -Infinity;
  return async function getTime() {
    if ((!cached || monotonic() - cached.at >= 60000) && !pending) {
      if (monotonic() - failedAt < 10000) throw new Error('Time source unavailable.');
      pending = (async () => {
        for (const host of ['time.cloudflare.com','time.google.com']) {
          try { cached = await query(host); return; } catch { /* try the second fixed source */ }
        }
        failedAt = monotonic();
        throw new Error('Time source unavailable.');
      })().finally(() => { pending = null; });
    }
    if (pending) await pending;
    const age = monotonic() - cached.at;
    return { unixMs: cached.unixMs + age, source:cached.source, protocol:'NTP',
      sampleAgeMs:age, uncertaintyMs:cached.uncertaintyMs + age * 0.00005, stratum:cached.stratum };
  };
}
