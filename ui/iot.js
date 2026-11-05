import { $, node } from './dom.js';
import { t, getLanguage } from '../i18n/index.js';
import { IOT_SCHEDULE_WIB } from '../iot-contract.js';

export function createIotReading({ request, opened }) {
  let identity = 0,
    controller,
    timer;
  const dialog = $('iot-dialog');
  function reset() {
    identity++;
    controller?.abort();
    clearTimeout(timer);
    $('iot-data').replaceChildren();
    $('iot-status').textContent = '';
    $('iot-auto').checked = false;
    dialog.close();
  }
  async function refresh() {
    clearTimeout(timer);
    controller?.abort();
    controller = new AbortController();
    const epoch = ++identity;
    const active = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      active.abort();
    }, 20000);
    const formatter = new Intl.DateTimeFormat(getLanguage(), {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'medium',
      timeStyle: 'medium',
      hourCycle: 'h23',
    });
    const date = (value) => formatter.format(new Date(value)) + ' WIB';
    $('iot-refresh').disabled = true;
    $('iot-status').textContent = t('iotLoading');
    try {
      const query = new URLSearchParams();
      if ($('iot-kind').value) query.set('event_type', $('iot-kind').value);
      const data = await request('/api/iot-readings?' + query, { signal: controller.signal });
      if (epoch !== identity || !dialog.open) return;
      const host = $('iot-data');
      host.replaceChildren();
      $('iot-status').textContent = t(
        !data.enabled
          ? 'iotNotConfigured'
          : !data.devices.length
            ? 'iotNoDevices'
            : !data.readings.length
              ? 'iotNoReadings'
              : 'iotUpdated',
      );
      if (data.enabled) {
        const list = node('div', null, 'iot-devices');
        for (const d of data.devices) {
          const card = node('section', null, 'notice');
          card.append(
            node('strong', d.device_id + ' · ' + d.plant),
            node('p', d.meter_id + ' / ' + d.meter_profile),
            node(
              'p',
              !d.active
                ? t('iotRevoked')
                : d.last_received_at
                  ? t('iotReceived') + ': ' + date(d.last_received_at)
                  : t('iotNeverReceived'),
            ),
          );
          list.append(card);
        }
        host.append(list);
        const wrap = node('div', null, 'iot-scroll'),
          table = node('table', null, 'iot-table');
        const head = node('tr');
        for (const k of ['iotDevice', 'iotCaptured', 'iotReceived', 'iotKind', 'iotEnergy'])
          head.append(node('th', t(k)));
        const thead = node('thead');
        thead.append(head);
        table.append(thead);
        const body = node('tbody');
        for (const r of data.readings) {
          const tr = node('tr');
          for (const v of [
            r.device_id,
            date(r.captured_at),
            date(r.received_at),
            t(r.event_type === 'checkpoint' ? 'iotCheckpoint' : 'iotTelemetry'),
            r.payload.readings.active_energy_kwh + ' kWh',
          ])
            tr.append(node('td', v));
          body.append(tr);
        }
        table.append(body);
        wrap.append(table);
        host.append(wrap);
      }
    } catch (error) {
      if (epoch === identity && (error.name !== 'AbortError' || timedOut))
        $('iot-status').textContent = t('iotLoadFailed');
    } finally {
      clearTimeout(timeout);
      if (epoch === identity) {
        $('iot-refresh').disabled = false;
        if (dialog.open && $('iot-auto').checked && !document.hidden)
          timer = setTimeout(refresh, 30000);
      }
    }
  }
  function open() {
    dialog.showModal();
    $('iot-schedule').textContent = IOT_SCHEDULE_WIB.join(' · ') + ' WIB';
    opened('iot');
    void refresh();
  }
  $('open-iot').addEventListener('click', open);
  $('iot-refresh').addEventListener('click', refresh);
  $('iot-kind').addEventListener('change', refresh);
  $('iot-auto').addEventListener('change', () => {
    clearTimeout(timer);
    if ($('iot-auto').checked) void refresh();
  });
  dialog.addEventListener('close', () => {
    identity++;
    controller?.abort();
    clearTimeout(timer);
    $('iot-data').replaceChildren();
  });
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (document.hidden) {
      identity++;
      controller?.abort();
      $('iot-refresh').disabled = false;
    } else if (dialog.open && $('iot-auto').checked) void refresh();
  });
  return { open, reset };
}
