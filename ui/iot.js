import { $, node } from './dom.js';
import { t, getLanguage } from '../i18n/index.js';
import {
  IOT_SCHEDULE_WIB,
  IOT_CURRENT_FIELDS,
  IOT_NODE_PROFILES,
  iotNodeConfig,
  iotPresence,
  IOT_DASHBOARD_POLL_MS,
  IOT_MANUAL_COOLDOWN_SECONDS,
  IOT_MANUAL_TIMEOUT_SECONDS,
} from '../iot-contract.js';

export function createIotReading({ request, opened, getUser }) {
  let identity = 0,
    scope = 0,
    managing = false,
    provisioning = null,
    cloudEndpoint = null,
    writeController,
    controller,
    timer,
    presenceTimer,
    buttonTimer,
    manualController,
    manualBusy = false,
    lastReloadAt = -Infinity,
    hasPending = false,
    presenceBadges = [];
  const dialog = $('iot-dialog');
  function stopPresence() {
    clearTimeout(presenceTimer);
    presenceBadges = [];
  }
  function paintPresence(now) {
    for (const { device, badge } of presenceBadges) {
      const status = iotPresence(device, now);
      badge.dataset.state = status;
      badge.textContent = t(
        {
          connected: 'iotConnected',
          offline: 'iotOffline',
          disabled: 'iotDisabled',
          unknown: 'iotUnknown',
        }[status],
      );
    }
  }
  function watchPresence(serverTime) {
    const serverNow = Date.parse(serverTime);
    const started = performance.now();
    const tick = () => {
      paintPresence(serverNow + performance.now() - started);
      if (dialog.open && !document.hidden && presenceBadges.length)
        presenceTimer = setTimeout(tick, 5000);
    };
    tick();
  }
  const currentText = (readings) =>
    IOT_CURRENT_FIELDS.filter((key) => readings[key] !== undefined)
      .map(
        (key) =>
          (key === 'current_a' ? '' : key.slice(8, 10).toUpperCase() + ' ') + readings[key] + ' A',
      )
      .join(' · ') || t('iotNotSent');
  function stopButtons() {
    clearInterval(buttonTimer);
    buttonTimer = null;
  }
  // The browser queues one command. A database GET is not a meter reading.
  async function requestNow(deviceId) {
    if (manualBusy || !dialog.open || !getUser()) return;
    const generation = scope;
    manualBusy = true;
    manualController = new AbortController();
    const active = manualController;
    const timeout = setTimeout(() => active.abort(), 20000);
    $('iot-status').textContent = t('iotRequesting');
    try {
      await request('/api/iot-refresh', {
        body: { device_id: deviceId },
        signal: active.signal,
      });
      if (scope === generation && dialog.open) {
        $('iot-status').textContent = t('iotQueued');
        void refresh();
      }
    } catch (error) {
      if (scope === generation && dialog.open && !active.signal.aborted) {
        $('iot-status').textContent = t(
          {
            REFRESH_PENDING: 'iotWaiting',
            REFRESH_COOLDOWN: 'iotCooling',
            DEVICE_OFFLINE: 'iotOffline',
          }[error.message] || 'iotRequestFailed',
        );
        void refresh();
      }
    } finally {
      clearTimeout(timeout);
      if (manualController === active) manualController = null;
      manualBusy = false;
    }
  }
  function clearCredential() {
    provisioning = null;
    $('iot-key').value = '';
    $('iot-endpoint').value = '';
    $('iot-key-device').textContent = '';
    $('iot-config-download').disabled = true;
    $('iot-credential').hidden = true;
  }
  function clearManagement() {
    scope++;
    manualController?.abort();
    manualBusy = false;
    stopButtons();
    writeController?.abort();
    managing = false;
    cloudEndpoint = null;
    $('iot-add').disabled = true;
    clearCredential();
    $('iot-management').hidden = true;
    $('iot-device-form').hidden = true;
    $('iot-device-form').reset();
    $('iot-manage-status').textContent = '';
    $('iot-cloud-status').textContent = '';
  }
  function reset() {
    stopButtons();
    hasPending = false;
    lastReloadAt = -Infinity;
    stopPresence();
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
    stopButtons();
    clearTimeout(presenceTimer);
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
      cloudEndpoint = data.connection?.endpoint || null;
      $('iot-add').disabled = managing || !cloudEndpoint;
      $('iot-cloud-status').textContent = t(
        data.connection?.endpoint ? 'iotCloudReady' : 'iotCloudMissing',
      );
      const host = $('iot-data');
      hasPending = false;
      stopPresence();
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
        const refreshButtons = [];
        const serverMillis = Date.parse(data.server_time) || Date.now();
        const started = performance.now();
        const clockNow = () => serverMillis + performance.now() - started;
        for (const d of data.devices) {
          const card = node('section', null, 'iot-device-card');
          const badge = node('span', null, 'iot-presence');
          presenceBadges.push({ device: d, badge });
          card.append(
            node('strong', d.device_id + ' · ' + d.plant),
            node('p', d.meter_id + ' / ' + d.meter_profile),
            badge,
            node(
              'p',
              !d.active
                ? t('iotRevoked')
                : d.last_received_at
                  ? t('iotLastContact') + ': ' + date(d.last_received_at)
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
            if (latest.received_at)
              card.append(
                node('p', t('iotReceived') + ': ' + date(latest.received_at), 'iot-meta'),
              );
          } else card.append(node('p', t('iotNoReadings'), 'iot-meta'));
          const read = node('button', null, 'iot-read-now');
          read.type = 'button';
          const glyph = node('span', '↻', 'iot-read-glyph');
          const label = node('span', t('iotReadNow'), 'iot-read-label');
          const count = node('span', '', 'iot-read-count');
          count.setAttribute('aria-hidden', 'true');
          read.append(glyph, label, count);
          read.addEventListener('click', () => void requestNow(d.device_id));
          card.append(read);
          refreshButtons.push({ d, read, label, count });
          if (d.refresh_pending) hasPending = true;
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
        watchPresence(data.server_time);
        const paintButtons = () => {
          const now = clockNow();
          for (const { d, read, label, count } of refreshButtons) {
            const requestedAt = Date.parse(d.refresh_requested_at) || 0;
            const cooldown = Math.max(0, (requestedAt +
              IOT_MANUAL_COOLDOWN_SECONDS * 1000 - now) / 1000);
            const pending = !!d.refresh_pending &&
              now - requestedAt < IOT_MANUAL_TIMEOUT_SECONDS * 1000;
            const connected = iotPresence(d, now) === 'connected';
            const state = pending ? 'pending' : cooldown > 0 ? 'cooldown' :
              !connected ? 'offline' : 'ready';
            read.dataset.state = state;
            read.disabled = manualBusy || state !== 'ready';
            read.style.setProperty('--iot-progress',
              String(Math.min(100, Math.max(0, cooldown / IOT_MANUAL_COOLDOWN_SECONDS * 100))));
            label.textContent = pending ? t('iotWaiting') : t('iotReadNow');
            count.textContent = !pending && cooldown > 0 ? Math.ceil(cooldown) + 's' : '';
            read.title = t(pending ? 'iotWaiting' : !connected ? 'iotOffline' : 'iotReadNow');
            read.setAttribute('aria-label', read.title +
              (cooldown > 0 ? ' ' + Math.ceil(cooldown) + 's' : ''));
          }
        };
        paintButtons();
        if (refreshButtons.length && !document.hidden)
          buttonTimer = setInterval(paintButtons, 250);
      }
    } catch (error) {
      if (epoch === identity && (error.name !== 'AbortError' || timedOut)) {
        paintPresence(NaN);
        stopPresence();
        $('iot-status').textContent = t('iotLoadFailed');
      }
    } finally {
      clearTimeout(timeout);
      if (epoch === identity) {
        const remaining = Math.max(0, IOT_MANUAL_COOLDOWN_SECONDS * 1000 -
          (performance.now() - lastReloadAt));
        $('iot-refresh').disabled = remaining > 0;
        if (dialog.open && !document.hidden) {
          if (hasPending) timer = setTimeout(refresh, 7500);
          else if ($('iot-auto').checked) timer = setTimeout(refresh, IOT_DASHBOARD_POLL_MS);
        }
        if (remaining > 0)
          setTimeout(() => {
            if (dialog.open && !document.hidden && performance.now() - lastReloadAt >=
              IOT_MANUAL_COOLDOWN_SECONDS * 1000) $('iot-refresh').disabled = false;
          }, remaining + 10);
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
        $('iot-endpoint').value = result.connection?.endpoint || '';
        provisioning = result.device;
        $('iot-config-download').disabled = !iotNodeConfig(
          provisioning,
          result.credential,
          $('iot-endpoint').value,
        );
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
            IOT_CLOUD_NOT_CONFIGURED: 'iotCloudMissing',
          }[error.message] || 'iotManageFailed',
        );
    } finally {
      clearTimeout(timeout);
      if (epoch === scope && dialog.open) {
        managing = false;
        for (const button of $('iot-management').querySelectorAll('button'))
          button.disabled = false;
        $('iot-add').disabled = !cloudEndpoint;
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
  for (const profile of IOT_NODE_PROFILES) {
    const option = node('option');
    option.value = profile;
    $('iot-node-profiles').append(option);
  }
  $('iot-config-download').addEventListener('click', () => {
    if (!dialog.open || getUser()?.role !== 'admin') return;
    const text = iotNodeConfig(provisioning, $('iot-key').value, $('iot-endpoint').value);
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = node('a');
    link.href = url;
    link.download = 'iot_credentials.local.h';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
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
  $('iot-refresh').addEventListener('click', () => {
    if (performance.now() - lastReloadAt < IOT_MANUAL_COOLDOWN_SECONDS * 1000) return;
    lastReloadAt = performance.now();
    void refresh();
  });
  $('iot-kind').addEventListener('change', refresh);
  $('iot-auto').addEventListener('change', () => {
    clearTimeout(timer);
    if ($('iot-auto').checked) void refresh();
  });
  dialog.addEventListener('close', () => {
    stopButtons();
    hasPending = false;
    stopPresence();
    clearManagement();
    identity++;
    controller?.abort();
    clearTimeout(timer);
    $('iot-data').replaceChildren();
  });
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (document.hidden) {
      stopButtons();
      manualController?.abort();
      manualBusy = false;
      hasPending = false;
      paintPresence(NaN);
      clearTimeout(presenceTimer);
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
  window.addEventListener('pagehide', reset);
  return { open, reset };
}
