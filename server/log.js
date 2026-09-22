import pkg from '../package.json' with { type: 'json' };

// Log only service diagnostics. Never include request bodies, headers, or readings.
export function timeLog(event, write = (line) => console.info(line)) {
  const record = {
    event: 'ntp.sync',
    timestamp: new Date().toISOString(),
    version: pkg.version,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    status: event.status === 'ok' ? 'ok' : 'unavailable',
    source: ['time.cloudflare.com', 'time.google.com'].includes(event.source) ? event.source : null,
    attempts: Number.isInteger(event.attempts) ? event.attempts : null,
    durationMs: Number.isFinite(event.durationMs) ? Math.round(event.durationMs) : null,
  };
  write(JSON.stringify(record));
}
