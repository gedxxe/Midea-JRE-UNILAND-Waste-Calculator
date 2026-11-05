import { $, node } from './dom.js';
import { t, getLanguage } from '../i18n/index.js';
import { IOT_SCHEDULE_WIB, IOT_CURRENT_FIELDS } from '../iot-contract.js';

export function createIotReading({ request, opened, getUser }) {
  let identity = 0,
    scope = 0,
    managing = false,
    writeController,
    controller,
    timer;
  const dialog = $('iot-dialog');
  const currentText = (readings) =>
    IOT_CURRENT_FIELDS.filter((key) => readings[key] !== undefined)
      .map(
        (key) =>
          (key === 'current_a' ? '' : key.slice(8, 10).toUpperCase() + ' ') + readings[key] + ' A',
      )
      .join(' · ') || t('iotNotSent');
  function clearCredential() {
    $('iot-key').value = '';
    $('iot-endpoint').value = '';
    $('iot-key-device').textContent = '';
    $('iot-credential').hidden = true;
  }
  function clearManagement() {
    scope++;
    writeController?.abort();
    managing = false;
    clearCredential();
    $('iot-management').hidden = true;
    $('iot-device-form').hidden = true;
    $('iot-device-form').reset();
    $('iot-manage-status').textContent = '';
  }
  function reset() {
    clearManagement();
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
      $('iot-management').hidden = !data.enabled || getUser()?.role !== 'admin';
      const host = $('iot-data');
      host.replaceChildren();
      $('iot-status').textContent = t(
        !data.enabled
          ? 'iotNotConfigured'
          : !data.devices.length
            ? 'iotNoDevices'
            : !data.readings.length
              ? data.devices.some((device) => device.latest_reading)
                ? 'iotNoMatches'
                : 'iotNoReadings'
              : 'iotUpdated',
      );
      if (data.enabled) {
        const list = node('div', null, 'iot-devices');
        for (const d of data.devices) {
          const card = node('section', null, 'iot-device-card');
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
          if (d.latest_reading) {
            const latest = d.latest_reading;
            card.append(
              node('p', t('iotLatest'), 'iot-meta'),
              node('strong', latest.readings.active_energy_kwh + ' kWh', 'iot-reading'),
            );
            card.append(
              node('p', t('iotCurrent') + ': ' + currentText(latest.readings)),
              node('p', t('iotCaptured') + ': ' + date(latest.captured_at), 'iot-meta'),
            );
          }
          if (getUser()?.role === 'admin') {
            const actions = node('div', null, 'iot-actions');
            for (const action of ['rotate', 'revoke']) {
              const button = node(
                'button',
                t(action === 'rotate' ? 'iotRotate' : 'iotDisable'),
                'button secondary',
              );
              button.type = 'button';
              button.disabled = managing || (action === 'revoke' && !d.active);
              button.addEventListener('click', () => {
                if (
                  window.confirm(t(action === 'rotate' ? 'iotRotateConfirm' : 'iotDisableConfirm'))
                )
                  void manage({ action, device_id: d.device_id });
              });
              actions.append(button);
            }
            card.append(actions);
          }
          list.append(card);
        }
        host.append(list);
        const wrap = node('div', null, 'iot-scroll'),
          table = node('table', null, 'iot-table');
        const head = node('tr');
        for (const k of [
          'iotDevice',
          'iotCaptured',
          'iotReceived',
          'iotKind',
          'iotEnergy',
          'iotCurrent',
        ])
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
            currentText(r.payload.readings),
          ])
            tr.append(node('td', v));
          body.append(tr);
        }
        table.append(body);
        wrap.append(table);
        if (data.readings.length) host.append(wrap);
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
  async function manage(body) {
    if (managing || getUser()?.role !== 'admin' || !dialog.open) return;
    const epoch = scope;
    managing = true;
    clearCredential();
    clearTimeout(timer);
    $('iot-auto').checked = false;
    writeController = new AbortController();
    const active = writeController;
    const timeout = setTimeout(() => active.abort(), 20000);
    for (const button of dialog.querySelectorAll('#iot-management button, .iot-device-card button'))
      button.disabled = true;
    $('iot-manage-status').textContent = t('iotSaving');
    try {
      const result = await request('/api/iot-devices', { body, signal: writeController.signal });
      if (epoch !== scope || !dialog.open) return;
      $('iot-device-form').hidden = true;
      if (result.credential) {
        $('iot-key').value = result.credential;
        $('iot-endpoint').value = new URL('/api/iot-ingest', location.origin).href;
        $('iot-key-device').textContent =
          result.device.device_id +
          ' · ' +
          result.device.meter_id +
          ' / ' +
          result.device.meter_profile;
        $('iot-credential').hidden = false;
      }
      $('iot-manage-status').textContent = t('iotDeviceSaved');
    } catch (error) {
      if (epoch === scope && dialog.open)
        $('iot-manage-status').textContent = t(
          {
            ALREADY_EXISTS: 'iotIdTaken',
            DEVICE_LIMIT_REACHED: 'iotDeviceLimit',
            INVALID_INPUT: 'iotInvalidIds',
            FORBIDDEN: 'iotAdminOnly',
            RATE_LIMITED: 'iotManageLimited',
          }[error.message] || 'iotManageFailed',
        );
    } finally {
      clearTimeout(timeout);
      if (epoch === scope && dialog.open) {
        managing = false;
        for (const button of $('iot-management').querySelectorAll('button'))
          button.disabled = false;
        void refresh();
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
  $('iot-add').addEventListener('click', () => {
    clearCredential();
    $('iot-device-form').hidden = false;
    $('iot-source-id').focus();
  });
  $('iot-cancel').addEventListener('click', () => {
    $('iot-device-form').hidden = true;
  });
  $('iot-device-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void manage({
      action: 'create',
      plant: $('iot-plant').value,
      device_id: $('iot-source-id').value,
      meter_id: $('iot-meter-id').value,
      meter_profile: $('iot-profile').value,
    });
  });
  $('iot-key-dismiss').addEventListener('click', clearCredential);
  $('iot-key-copy').addEventListener('click', async () => {
    const epoch = scope;
    if (!$('iot-key').value || !dialog.open) return;
    try {
      await navigator.clipboard.writeText($('iot-key').value);
      if (epoch === scope && dialog.open) $('iot-manage-status').textContent = t('copied');
    } catch {
      if (epoch === scope && dialog.open) $('iot-manage-status').textContent = t('iotCopyFailed');
    }
  });
  $('iot-refresh').addEventListener('click', refresh);
  $('iot-kind').addEventListener('change', refresh);
  $('iot-auto').addEventListener('change', () => {
    clearTimeout(timer);
    if ($('iot-auto').checked) void refresh();
  });
  dialog.addEventListener('close', () => {
    clearManagement();
    identity++;
    controller?.abort();
    clearTimeout(timer);
    $('iot-data').replaceChildren();
  });
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (document.hidden) {
      clearCredential();
      if (managing) {
        scope++;
        writeController?.abort();
        managing = false;
        $('iot-manage-status').textContent = t('iotManageFailed');
        for (const button of $('iot-management').querySelectorAll('button'))
          button.disabled = false;
      }
      identity++;
      controller?.abort();
      $('iot-refresh').disabled = false;
    } else if (dialog.open) void refresh();
  });
  window.addEventListener('pagehide', clearManagement);
  return { open, reset };
}
