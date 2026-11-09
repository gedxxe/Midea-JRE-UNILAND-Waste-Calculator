const $ = (id) => document.getElementById(id);
const W = 7 * 3600000;
const slots = ['06:30', '08:00', '17:00', '18:00'];
const dateShift = (day, amount) =>
  new Date(Date.parse(day + 'T00:00:00Z') + amount * 86400000).toISOString().slice(0, 10);
const wibParts = (stamp) => {
  const time = Date.parse(stamp);
  return Number.isFinite(time) ? new Date(time + W).toISOString().slice(0, 16) : null;
};
const isDue = (date, slot, now) => Date.parse(date + 'T' + slot + ':00+07:00') + 10 * 60000 <= now;
const number = (value, digits = 2) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value);
const wibTime = (value) => {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return (
    new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value)) + ' WIB'
  );
};
const shortDay = (day) => (day ? day.slice(8, 10) + '/' + day.slice(5, 7) : '—');
const areaLabel = (d) => d.area || 'Belum diatur';
const label = (d) => d.display_name || d.meter_id || d.device_id;
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};

// Checkpoints are immutable cumulative snapshots, not delta events.
// A daily delta needs the same WIB checkpoint on two consecutive dates.
export function checkpointIndex(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const dateTime = wibParts(row.scheduled_at);
    if (!dateTime || !slots.includes(dateTime.slice(11))) continue;
    const n = Number(row.kwh);
    if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 1000))) continue;
    const key = row.device_id + '|' + dateTime.slice(0, 10) + '|' + dateTime.slice(11);
    const old = map.get(key);
    if (!old || Date.parse(row.received_at) > Date.parse(old.received_at))
      map.set(key, { value: n, received_at: row.received_at });
  }
  return map;
}
export function calculateSeries(rows, devices, end, days, slot, serverTime) {
  const index = checkpointIndex(rows),
    daily = [],
    issues = [],
    perMeter = new Map();
  const now = Date.parse(serverTime);
  for (let i = days - 1; i >= 0; i--) {
    const day = dateShift(end, -i),
      previous = dateShift(day, -1);
    let total = 0,
      complete = devices.length > 0;
    for (const d of devices) {
      const a = index.get(d.device_id + '|' + previous + '|' + slot);
      const b = index.get(d.device_id + '|' + day + '|' + slot);
      if (!isDue(day, slot, now)) {
        complete = false;
        continue;
      }
      if (!a || !b) {
        complete = false;
        issues.push({
          day,
          device: d.device_id,
          name: label(d),
          slot,
          reason:
            !a && !b
              ? 'Kedua checkpoint hilang'
              : !a
                ? 'Checkpoint awal hilang'
                : 'Checkpoint akhir hilang',
        });
      } else if (b.value < a.value) {
        complete = false;
        issues.push({
          day,
          device: d.device_id,
          name: label(d),
          slot,
          reason: 'Counter turun / reset',
        });
      } else {
        const value = b.value - a.value;
        if (day === end) perMeter.set(d.device_id, value);
        total += value;
      }
    }
    daily.push({ day, value: complete ? total : null, complete });
  }
  return { daily, issues: issues.reverse(), perMeter };
}
export function weeklySeries(daily) {
  const groups = new Map();
  for (const d of daily) {
    const at = new Date(d.day + 'T00:00:00Z');
    const monday = dateShift(d.day, -(at.getUTCDay() + 6) % 7);
    if (!groups.has(monday)) groups.set(monday, { day: monday, value: 0, counted: 0, seen: 0 });
    const g = groups.get(monday);
    g.seen++;
    if (d.value !== null) {
      g.value += d.value;
      g.counted++;
    }
  }
  return [...groups.values()].map((g) => ({
    ...g,
    value: g.counted ? g.value : null,
    complete: g.counted === 7 && g.seen === 7,
  }));
}

const state = {
  user: null,
  data: null,
  busy: false,
  manualAt: -Infinity,
  readLocks: new Map(),
  requestBusy: false,
  lastKey: '',
  poll: null,
  auto: null,
  next: null,
  requestController: null,
  serverTime: null,
  receivedAt: 0,
};
const observedNow = () =>
  state.serverTime ? state.serverTime + (performance.now() - state.receivedAt) : Date.now();
const filters = () => ({
  plant: $('plant').value,
  area: $('area').value,
  meter: $('meter').value,
  date: $('date').value,
  slot: $('slot').value,
  days: Number($('days').value),
});
const selectedDevices = () => {
  const { plant, area, meter } = filters();
  return (state.data?.devices || []).filter(
    (d) =>
      (!plant || d.plant === plant) &&
      (!area || areaLabel(d) === area) &&
      (!meter || d.device_id === meter),
  );
};
const updateNotice = (message, tone = '') => {
  $('notice').textContent = message;
  $('notice').dataset.tone = tone;
};
async function api(path, body, signal) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: {
      'X-Meter-User': state.user.id,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'SERVICE_UNAVAILABLE');
  return result;
}
function fillSelect(select, rows, selected, allLabel) {
  select.replaceChildren(new Option(allLabel, ''));
  for (const [value, title] of rows) select.add(new Option(title, value));
  select.value = [...select.options].some((o) => o.value === selected) ? selected : '';
}
function renderFilters() {
  if (!state.data) return;
  const area = $('area').value,
    meter = $('meter').value,
    plant = $('plant').value;
  const within = state.data.devices.filter((d) => !plant || d.plant === plant);
  fillSelect(
    $('area'),
    [...new Set(within.map(areaLabel))].sort().map((x) => [x, x]),
    area,
    'Semua area',
  );
  const areaValue = $('area').value;
  fillSelect(
    $('meter'),
    within
      .filter((d) => !areaValue || areaLabel(d) === areaValue)
      .map((d) => [d.device_id, label(d) + ' · ' + d.device_id]),
    meter,
    'Semua meter',
  );
}
function setText(id, value) {
  $(id).textContent = value;
}
function svgNode(name, attrs = {}, text) {
  const v = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) v.setAttribute(key, String(value));
  if (text !== undefined) v.textContent = text;
  return v;
}
function drawBars(id, points, weekly = false) {
  const host = $(id);
  host.replaceChildren();
  if (!points.length || !points.some((x) => x.value !== null)) {
    host.append(el('p', 'Belum ada pasangan checkpoint valid pada rentang ini.', 'chart-note'));
    return;
  }
  const svg = svgNode('svg', {
    viewBox: '0 0 600 230',
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  });
  const pad = { top: 20, bottom: 30, left: 44, right: 8 };
  const innerW = 600 - pad.left - pad.right,
    innerH = 230 - pad.top - pad.bottom;
  const values = points.filter((p) => p.value !== null).map((p) => p.value);
  const maximum = Math.max(1, ...values) * 1.15;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (innerH * i) / 4;
    svg.append(
      svgNode('line', { x1: pad.left, y1: y, x2: 600 - pad.right, y2: y, stroke: '#e6edf3' }),
    );
    svg.append(
      svgNode(
        'text',
        {
          x: pad.left - 7,
          y: y + 3,
          fill: '#9aa8b5',
          'font-size': 10,
          'text-anchor': 'end',
        },
        number(maximum * (1 - i / 4), 0),
      ),
    );
  }
  const segment = innerW / points.length;
  const width = Math.max(3, Math.min(weekly ? 58 : 20, segment * 0.72));
  points.forEach((p, i) => {
    const x = pad.left + (i + 0.5) * segment - width / 2;
    const amount = p.value === null ? 0 : p.value;
    const height = (amount / maximum) * innerH;
    const rect = svgNode('rect', {
      x,
      y: pad.top + innerH - Math.max(3, height),
      width,
      height: Math.max(3, height),
      rx: 3,
      fill: p.value === null ? '#d6e2e9' : p.complete ? '#159bbf' : '#74a7be',
      opacity: p.value === null ? '.4' : '1',
    });
    rect.append(
      svgNode(
        'title',
        {},
        p.day +
          ': ' +
          (p.value === null
            ? 'Tidak ada data valid'
            : number(p.value, 3) + ' kWh' + (p.complete ? '' : ' (parsial)')),
      ),
    );
    svg.append(rect);
    if (weekly || i % Math.max(1, Math.ceil(points.length / 8)) === 0 || i === points.length - 1)
      svg.append(
        svgNode(
          'text',
          {
            x: x + width / 2,
            y: 221,
            'text-anchor': 'middle',
            fill: '#8b9caf',
            'font-size': 10,
          },
          shortDay(p.day),
        ),
      );
  });
  host.append(svg);
}
function renderComparison(devices, perMeter) {
  const host = $('comparison');
  host.replaceChildren();
  const entries = devices
    .filter((d) => perMeter.has(d.device_id))
    .map((d) => ({ d, value: perMeter.get(d.device_id) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  if (!entries.length) {
    host.classList.add('empty');
    host.append('Tidak ada delta valid untuk tanggal dan checkpoint ini.');
    return;
  }
  host.classList.remove('empty');
  const max = Math.max(1, ...entries.map((r) => r.value));
  for (const item of entries) {
    const row = el('div', undefined, 'compare-row');
    const name = el('span', label(item.d), 'compare-name');
    name.title = item.d.device_id;
    const track = el('div', undefined, 'compare-track');
    const bar = el('i');
    bar.style.width = Math.min(100, (item.value / max) * 100) + '%';
    track.append(bar);
    row.append(name, track, el('strong', number(item.value, 2) + ' kWh', 'compare-value'));
    host.append(row);
  }
}
const badge = (status) => {
  const variant = status === 'connected' ? 'good' : status === 'offline' ? 'bad' : 'unknown';
  const label =
    {
      connected: 'Contact OK',
      offline: 'Offline',
      disabled: 'Nonaktif',
      unknown: 'Belum diketahui',
    }[status] || '—';
  return el('span', label, 'pill ' + variant);
};
function renderMeters(devices) {
  const host = $('meter-rows');
  host.replaceChildren();
  if (!devices.length) {
    const tr = el('tr'),
      td = el('td', 'Tidak ada meter pada filter ini.', 'center');
    td.colSpan = 6;
    tr.append(td);
    host.append(tr);
    return;
  }
  for (const d of devices) {
    const row = el('tr');
    const device = el('td');
    device.append(
      el('strong', label(d)),
      el('small', d.device_id + ' · ' + d.meter_profile + ' · ' + d.plant),
    );
    const area = el('td', areaLabel(d));
    const latest = el('td', d.latest?.kwh != null ? number(Number(d.latest.kwh), 3) : '—');
    const recv = el('td', wibTime(d.latest?.received_at));
    const status = el('td');
    status.append(badge(nodeStatus(d)));
    const action = el('td');
    if (state.user?.role === 'admin') {
      const edit = el('button', 'Atur area', 'edit-area');
      edit.type = 'button';
      edit.addEventListener('click', () => void editArea(d));
      action.append(edit);
    } else action.textContent = '—';
    row.append(device, area, latest, recv, status, action);
    host.append(row);
  }
}
function nodeStatus(d) {
  if (!d.active) return 'disabled';
  const when = Date.parse(d.last_received_at);
  const now = observedNow();
  if (!Number.isFinite(when) || when > now) return 'unknown';
  return now - when < 180000 ? 'connected' : 'offline';
}
function renderEvents(events) {
  const host = $('event-rows');
  host.replaceChildren();
  setText('event-count', events.length + ' peristiwa');
  if (!events.length) {
    const tr = el('tr'),
      td = el(
        'td',
        'Tidak ada kehilangan checkpoint / anomali terdeteksi pada rentang ini.',
        'center',
      );
    td.colSpan = 4;
    tr.append(td);
    host.append(tr);
    return;
  }
  for (const item of events.slice(0, 100)) {
    const tr = el('tr');
    for (const value of [shortDay(item.day), item.name, item.slot + ' WIB', item.reason])
      tr.append(el('td', value));
    host.append(tr);
  }
}
function renderStatus(devices) {
  const connected = devices.filter((d) => nodeStatus(d) === 'connected').length;
  setText('kpi-online', connected + ' / ' + devices.length);
  setText(
    'node-summary',
    connected + ' dari ' + devices.length + ' node terhubung ke cloud (kontak ≤180 detik)',
  );
  $('node-dot').className = 'node-dot' + (connected ? '' : ' offline');
  const stamps = devices.map((d) => Date.parse(d.latest?.received_at)).filter(Number.isFinite);
  setText(
    'last-update',
    'Data terakhir diterima: ' +
      (stamps.length ? wibTime(new Date(Math.max(...stamps)).toISOString()) : '—'),
  );
}
function render() {
  if (!state.data?.enabled) return;
  const { days, date, slot } = filters(),
    devices = selectedDevices();
  const safe = !state.data.truncated;
  const { daily, issues, perMeter } = safe
    ? calculateSeries(
        state.data.checkpoints,
        devices,
        date,
        days,
        slot,
        new Date(observedNow()).toISOString(),
      )
    : { daily: [], issues: [], perMeter: new Map() };
  const newest = daily.at(-1);
  setText('kpi-period', slot + '–' + slot);
  setText(
    'kpi-consumption',
    newest?.value !== null && newest?.value !== undefined ? number(newest.value, 3) + ' kWh' : '—',
  );
  setText(
    'kpi-consumption-note',
    newest?.value !== null && newest?.value !== undefined
      ? '24 jam teramati · ' + shortDay(date)
      : 'Tidak lengkap / belum jatuh tempo',
  );
  setText('kpi-meters', String(devices.length));
  setText(
    'kpi-meters-note',
    devices.length + ' dari ' + state.data.devices.length + ' sumber aktif/terdaftar',
  );
  setText('kpi-issues', safe ? String(issues.length) : '—');
  setText(
    'kpi-issues-note',
    safe
      ? 'Hilang / counter turun dalam ' + days + ' hari'
      : 'Riwayat terlalu besar; persempit filter',
  );
  drawBars('daily-chart', daily);
  drawBars('weekly-chart', weeklySeries(daily), true);
  setText(
    'daily-footnote',
    'Hanya hari dengan seluruh pasangan counter valid yang digambar. Tidak ada interpolasi.',
  );
  setText(
    'weekly-footnote',
    'Minggu parsial adalah akumulasi hari lengkap yang tersedia, bukan estimasi 7 hari.',
  );
  renderComparison(devices, perMeter);
  renderMeters(devices);
  renderEvents(issues);
  renderStatus(devices);
  renderReadButton();
}
function renderReadButton() {
  const button = $('read-now');
  const chosen = selectedDevices();
  const d = chosen.length === 1 ? chosen[0] : null;
  button.hidden = !state.data?.manual_refresh_enabled || !d;
  if (button.hidden) return;
  const age = observedNow() - Date.parse(d.refresh_requested_at);
  const cooling = Number.isFinite(age) && age >= 0 && age < 10000;
  const pending = d.refresh_pending && age < 120000;
  const lock = state.readLocks.get(d.device_id) || -Infinity;
  const local = performance.now() < lock;
  button.disabled =
    state.requestBusy || pending || cooling || local || nodeStatus(d) !== 'connected';
  button.textContent = state.requestBusy
    ? 'Mengirim permintaan…'
    : pending
      ? 'Menunggu pembacaan node…'
      : cooling || local
        ? 'Cooldown ' +
          Math.max(1, Math.ceil(Math.max(10000 - age, lock - performance.now()) / 1000)) +
          ' dtk'
        : '↗ Baca meter sekarang';
}
async function editArea(d) {
  if (state.user?.role !== 'admin') return;
  const next = prompt(
    'Area untuk ' + label(d) + ' (maks. 64 karakter; kosongkan untuk tidak diatur):',
    d.area || '',
  );
  if (next === null) return;
  if (next.trim().length > 64) {
    updateNotice('Nama area terlalu panjang.', 'error');
    return;
  }
  try {
    await api('/api/iot-dashboard', {
      action: 'set_area',
      device_id: d.device_id,
      area: next.trim(),
    });
    d.area = next.trim();
    renderFilters();
    render();
    updateNotice('Area berhasil disimpan untuk ' + label(d) + '.', 'ok');
  } catch (error) {
    updateNotice(
      error.message === 'IOT_AREA_MIGRATION_REQUIRED'
        ? 'Metadata area belum diaktifkan. Terapkan migrasi 012 setelah review dan backup.'
        : 'Gagal menyimpan area: ' + error.message,
      'error',
    );
  }
}
function controlsBusy(value) {
  state.busy = value;
  $('refresh-data').disabled = value;
  $('refresh-data').classList.toggle('refreshing', value);
}
async function reload(manual = false) {
  if (!state.user || document.hidden) return;
  if (manual && (state.busy || performance.now() - state.manualAt < 10000)) return;
  if (manual) state.manualAt = performance.now();
  state.requestController?.abort();
  state.requestController = new AbortController();
  controlsBusy(true);
  const { plant, date, days } = filters();
  const params = new URLSearchParams({ date, days: String(days) });
  if (plant) params.set('plant', plant);
  const key = params.toString();
  try {
    const data = await api('/api/iot-dashboard?' + key, undefined, state.requestController.signal);
    state.data = data;
    state.lastKey = key;
    state.serverTime = Date.parse(data.server_time);
    state.receivedAt = performance.now();
    if (!data.enabled) {
      updateNotice(
        'IoT cloud belum diaktifkan di deployment ini. Login saja tidak mengaktifkan telemetri.',
        'error',
      );
      controlsBusy(false);
      return;
    }
    renderFilters();
    render();
    updateNotice(
      data.truncated
        ? 'Riwayat melewati batas 15.000 checkpoint. Pilih satu factory/meter agar grafik tidak parsial.'
        : 'Data cloud termuat · ' +
            data.checkpoints.length +
            ' checkpoint · diperbarui ' +
            wibTime(data.server_time),
      data.truncated ? 'error' : 'ok',
    );
  } catch (error) {
    if (error.name !== 'AbortError')
      updateNotice('Gagal mengambil data: ' + error.message, 'error');
  } finally {
    controlsBusy(false);
    renderReadButton();
  }
}
async function pollStatus() {
  if (!state.data?.enabled || !state.user || document.hidden) return;
  try {
    const result = await api('/api/iot-readings?status_only=1');
    if (!result.enabled) return;
    let completed = false;
    for (const d of state.data.devices) {
      const latest = result.devices.find((x) => x.device_id === d.device_id);
      if (latest) {
        if (d.refresh_pending && !latest.refresh_pending && latest.refresh_completed_at)
          completed = true;
        Object.assign(d, {
          active: latest.active,
          last_received_at: latest.last_received_at,
          refresh_pending: latest.refresh_pending,
          refresh_requested_at: latest.refresh_requested_at,
          refresh_completed_at: latest.refresh_completed_at,
        });
      }
    }
    renderStatus(selectedDevices());
    renderReadButton();
    if (completed) void reload();
  } catch {
    // Unknown is safer than presenting cached green status as a confirmed live heartbeat.
    for (const d of state.data.devices) d.last_received_at = null;
    renderStatus(selectedDevices());
    renderReadButton();
  }
}
async function readNow() {
  const list = selectedDevices();
  const d = list.length === 1 ? list[0] : null;
  if (
    !d ||
    !state.data?.manual_refresh_enabled ||
    state.requestBusy ||
    d.refresh_pending ||
    nodeStatus(d) !== 'connected' ||
    performance.now() < (state.readLocks.get(d.device_id) || -Infinity)
  )
    return;
  state.requestBusy = true;
  state.readLocks.set(d.device_id, performance.now() + 10000);
  renderReadButton();
  try {
    const result = await api('/api/iot-refresh', { device_id: d.device_id });
    if (!result.queued) throw Error('ACK_NOT_CONFIRMED');
    d.refresh_pending = true;
    d.refresh_requested_at = result.requested_at;
    d.refresh_completed_at = null;
    updateNotice(
      'Permintaan tersimpan di server. Tunggu heartbeat node dan pembacaan Modbus baru.',
      'ok',
    );
  } catch (error) {
    updateNotice('Permintaan tidak dikonfirmasi: ' + error.message, 'error');
    await pollStatus();
  } finally {
    state.requestBusy = false;
    renderReadButton();
  }
}
function tick() {
  const now = new Date();
  setText(
    'clock',
    new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(now) + ' WIB',
  );
  if (state.user && !document.hidden) {
    const remaining = Math.max(0, 10 - Math.floor((performance.now() - state.manualAt) / 1000));
    $('refresh-data').disabled = state.busy || remaining > 0;
    setText('refresh-label', remaining > 0 ? 'Refresh (' + remaining + 's)' : 'Refresh data');
    renderReadButton();
  }
}
async function init() {
  $('date').value = new Date(Date.now() + W).toISOString().slice(0, 10);
  tick();
  state.next = setInterval(tick, 1000);
  $('refresh-data').addEventListener('click', () => void reload(true));
  $('read-now').addEventListener('click', () => void readNow());
  for (const id of ['date', 'days', 'plant']) $(id).addEventListener('change', () => void reload());
  for (const id of ['area', 'meter', 'slot'])
    $(id).addEventListener('change', () => {
      if (id === 'area') renderFilters();
      render();
    });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) state.requestController?.abort();
    else if (state.user) {
      void reload();
      void pollStatus();
    }
  });
  try {
    const auth = await fetch('/api/auth', { credentials: 'same-origin', cache: 'no-store' });
    if (!auth.ok) throw Error('AUTH_UNAVAILABLE');
    const result = await auth.json();
    if (!result.user || result.user.mustChangePassword) {
      updateNotice(
        'Silakan login melalui aplikasi utama untuk mengakses dashboard monitoring.',
        'error',
      );
      setText('session', 'Belum login');
      return;
    }
    state.user = result.user;
    setText('session', result.user.username + ' · ' + result.user.role);
    await reload();
    state.poll = setInterval(() => void pollStatus(), 60000);
    state.auto = setInterval(() => void reload(), 600000);
  } catch (error) {
    updateNotice(
      'Sesi tidak tersedia: ' + error.message + '. Kembali ke halaman utama untuk login.',
      'error',
    );
    setText('session', 'Tidak tersambung');
  }
}
if (typeof document !== 'undefined') void init();
