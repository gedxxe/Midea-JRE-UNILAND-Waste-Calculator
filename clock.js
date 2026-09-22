export class NetworkClock {
  constructor({ fetcher = (...args) => fetch(...args), monotonic = () => performance.now(), wall = () => Date.now() } = {}) {
    this.fetcher = fetcher; this.monotonic = monotonic; this.wall = wall;
    this.anchor = null; this.pending = null; this.lastAttemptFailed = false;
  }
  get synchronized() { return !!this.anchor && !this.lastAttemptFailed && this.monotonic() - this.anchor.at < 900000; }
  now() { return this.anchor ? this.anchor.unixMs + this.monotonic() - this.anchor.at : this.wall(); }
  async sync() {
    if (this.pending) return this.pending;
    this.pending = this.sample().finally(() => { this.pending = null; });
    return this.pending;
  }
  async sample() {
    const samples = [];
    try {
      for (let i = 0; i < 3; i++) {
        const start = this.monotonic();
        const response = await this.fetcher('/api/time', {cache:'no-store', signal:AbortSignal.timeout(5000)});
        if (!response.ok) throw new Error('Sinkronisasi NTP gagal.');
        const data = await response.json();
        const at = this.monotonic();
        const rtt = at - start;
        if (data.protocol !== 'NTP' || !['time.cloudflare.com','time.google.com'].includes(data.source) ||
            !Number.isFinite(data.unixMs) || data.unixMs < 1577836800000 || data.unixMs > 4102444800000 ||
            !Number.isFinite(data.sampleAgeMs) || data.sampleAgeMs < 0 || data.sampleAgeMs > 65000 ||
            !Number.isFinite(data.uncertaintyMs) || data.uncertaintyMs < 0 || data.uncertaintyMs > 12000 || rtt > 5000) {
          throw new Error('Respons waktu tidak valid.');
        }
        samples.push({unixMs:data.unixMs + rtt / 2, at, rtt, source:data.source, uncertaintyMs:data.uncertaintyMs + rtt / 2});
      }
      this.anchor = samples.sort((a,b) => a.rtt - b.rtt)[0];
      this.lastAttemptFailed = false;
      return true;
    } catch {
      this.lastAttemptFailed = true;
      return false;
    }
  }
}
export function wibDate(unixMs) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date(unixMs));
  const values = Object.fromEntries(parts.map(p => [p.type,p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
