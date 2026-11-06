import { $, node, svgNode } from './dom.js';
import { t, getLanguage } from '../i18n/index.js';
import {
  IOT_SCHEDULE_WIB,
  IOT_CURRENT_FIELDS,
  IOT_NODE_PROFILES,
  iotNodeConfig,
  iotConnectionConfig,
  validIotName,
  iotPresence,
  IOT_DASHBOARD_POLL_MS,
  IOT_MANUAL_COOLDOWN_SECONDS,
  IOT_MANUAL_TIMEOUT_SECONDS,
  formatIotReading,
} from '../iot-contract.js';

export function createIotReading({ request, opened, getUser }) {
  let identity = 0,
    scope = 0,
    managing = false,
    editingId = null,
    cardReady = false,
    provisioning = null,
    cloudEndpoint = null,
    writeController,
    controller,
    timer,
    presenceTimer,
    buttonTimer,
    statusTimer,
    statusController,
    reloadTimer,
    controls = [],
    checked = false,
    serverMillis = NaN,
    clockStarted = 0,
    manualEnabled = false,
    readNotice = '',
    requestLocks = new Map(),
    manualController,
    manualBusy = false,
    lastReloadAt = -Infinity,
    hasPending = false,
    presenceBadges = [];
  const dialog = $('iot-dialog');
  const clockNow = () => serverMillis + performance.now() - clockStarted;
  function setClock(time) {
    serverMillis = Date.parse(time);
    clockStarted = performance.now();
  }
  function stopPresence() {
    clearTimeout(presenceTimer);
    presenceBadges = [];
  }
  function paintPresence(now) {
    for (const { device, badge, contact, date } of presenceBadges) {
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
      if (contact)
        contact.textContent = !device.active
          ? t('iotRevoked')
          : device.last_received_at
            ? t('iotLastContact') + ': ' + date(device.last_received_at)
            : t('iotNeverReceived');
    }
  }
  function watchPresence(serverTime) {
    setClock(serverTime);
    const tick = () => {
      paintPresence(clockNow());
      if (dialog.open && !document.hidden && presenceBadges.length)
        presenceTimer = setTimeout(tick, 5000);
    };
    tick();
  }
  const currentText = (readings) =>
    IOT_CURRENT_FIELDS.filter((key) => readings[key] !== undefined)
      .map(
        (key) =>
          (key === 'current_a' ? '' : key.slice(8, 10).toUpperCase() + ' ') +
          formatIotReading(readings[key]) +
          ' A',
      )
      .join(' · ') || t('iotNotSent');
  function stopButtons() {
    clearInterval(buttonTimer);
    buttonTimer = null;
  }
  // React Bits FuseButton outline adapted for a cooldown, not a delayed action/Undo.
  // David Haz, MIT + Commons Clause: asset/licenses/react-bits.txt.
  function fuse(button) {
    const svg = svgNode('svg', { class: 'iot-read-rim', 'aria-hidden': 'true' });
    svg.append(
      svgNode('rect', {
        x: 1,
        y: 1,
        width: 'calc(100% - 2px)',
        height: 'calc(100% - 2px)',
        rx: 13,
        pathLength: 1,
      }),
    );
    button.append(svg);
  }
  function paintButtons() {
    hasPending = false;
    const now = clockNow();
    for (const { d, read, label, count } of controls) {
      const requested = Date.parse(d.refresh_requested_at);
      const remaining = Math.max(0, requested + IOT_MANUAL_COOLDOWN_SECONDS * 1000 - now);
      const localRemaining = Math.max(0, (requestLocks.get(d.device_id) || 0) - performance.now());
      const cooldown = Math.max(Number.isFinite(remaining) ? remaining : 0, localRemaining) / 1000;
      const pending =
        !!d.refresh_pending &&
        Number.isFinite(now) &&
        now - requested < IOT_MANUAL_TIMEOUT_SECONDS * 1000;
      hasPending ||= pending;
      const connected = checked && iotPresence(d, now) === 'connected';
      const state = manualBusy
        ? 'requesting'
        : pending
          ? 'pending'
          : cooldown > 0
            ? 'cooldown'
            : !connected
              ? 'offline'
              : 'ready';
      read.dataset.state = state;
      read.disabled = managing || !manualEnabled || state !== 'ready';
      read.setAttribute('aria-busy', String(state === 'requesting' || pending));
      read.style.setProperty(
        '--iot-progress',
        String(Math.min(1, cooldown / IOT_MANUAL_COOLDOWN_SECONDS)),
      );
      label.textContent = t(
        state === 'requesting' ? 'iotRequesting' : pending ? 'iotWaiting' : 'iotReadNow',
      );
      count.textContent = cooldown > 0 ? Math.ceil(cooldown) + 's' : '';
      read.title = t(
        pending ? 'iotWaiting' : !checked ? 'iotUnknown' : !connected ? 'iotOffline' : 'iotReadNow',
      );
      read.setAttribute(
        'aria-label',
        read.title + (cooldown > 0 ? ' ' + Math.ceil(cooldown) + 's' : ''),
      );
    }
  }
  function scheduleStatus() {
    clearTimeout(statusTimer);
    if (dialog.open && !document.hidden && (hasPending || $('iot-auto').checked))
      statusTimer = setTimeout(refreshStatus, hasPending ? 7500 : 60000);
  }
  async function refreshStatus() {
    if (!dialog.open || document.hidden) return;
    statusController?.abort();
    const active = new AbortController();
    statusController = active;
    const epoch = identity;
    const timeout = setTimeout(() => active.abort(), 20000);
    try {
      const archived =
        $('iot-show-archived').checked && getUser()?.role === 'admin' ? '&include_archived=1' : '';
      const data = await request('/api/iot-readings?status_only=1' + archived, {
        signal: active.signal,
      });
      if (
        epoch !== identity ||
        statusController !== active ||
        active.signal.aborted ||
        !dialog.open
      )
        return;
      const wasPending = presenceBadges.some(({ device }) => device.refresh_pending);
      let completed = false;
      if (!data.enabled) throw Error('IOT_NOT_CONFIGURED');
      checked = true;
      manualEnabled = !!data.connection?.manual_refresh_enabled;
      for (const { device } of presenceBadges) {
        const latest = data.devices.find((item) => item.device_id === device.device_id);
        if (latest) {
          completed ||=
            !!device.refresh_pending && !!latest.refresh_completed_at && !latest.refresh_pending;
          Object.assign(device, latest);
        } else device.active = false;
      }
      clearTimeout(presenceTimer);
      watchPresence(data.server_time);
      paintButtons();
      if (completed) {
        readNotice = '';
        void refresh();
      } else if (wasPending && !hasPending) {
        readNotice = 'iotReadExpired';
        $('iot-status').textContent = t(readNotice);
      }
    } catch {
      if (epoch === identity && statusController === active && dialog.open) {
        checked = false;
        clearTimeout(presenceTimer);
        paintPresence(NaN);
        paintButtons();
        $('iot-status').textContent = t('iotLoadFailed');
      }
    } finally {
      clearTimeout(timeout);
      if (statusController === active) {
        statusController = null;
        scheduleStatus();
      }
    }
  }
  // The browser queues one command. A database GET is not a meter reading.
  async function requestNow(deviceId) {
    const control = controls.find(({ d }) => d.device_id === deviceId);
    paintButtons();
    if (manualBusy || managing || !control || control.read.disabled || !dialog.open || !getUser())
      return;
    const generation = scope;
    manualBusy = true;
    requestLocks.set(deviceId, performance.now() + IOT_MANUAL_COOLDOWN_SECONDS * 1000);
    readNotice = '';
    paintButtons();
    manualController = new AbortController();
    const active = manualController;
    const timeout = setTimeout(() => active.abort(), 20000);
    $('iot-status').textContent = t('iotRequesting');
    try {
      const result = await request('/api/iot-refresh', {
        body: { device_id: deviceId },
        signal: active.signal,
      });
      if (
        scope === generation &&
        manualController === active &&
        !active.signal.aborted &&
        dialog.open
      ) {
        if (result.queued !== true || !Number.isFinite(Date.parse(result.requested_at)))
          throw Error('INVALID_ACK');
        control.d.refresh_requested_at = result.requested_at;
        control.d.refresh_completed_at = null;
        control.d.refresh_pending = true;
        readNotice = 'iotQueued';
        $('iot-status').textContent = t('iotQueued');
      }
    } catch (error) {
      if (scope === generation && manualController === active && dialog.open) {
        readNotice =
          {
            REFRESH_PENDING: 'iotWaiting',
            REFRESH_COOLDOWN: 'iotCooling',
            DEVICE_OFFLINE: 'iotOffline',
          }[error.message] || 'iotRequestUnconfirmed';
        $('iot-status').textContent = t(readNotice);
      }
    } finally {
      clearTimeout(timeout);
      if (manualController === active) {
        manualController = null;
        manualBusy = false;
        paintButtons();
        if (scope === generation && dialog.open) void refreshStatus();
      }
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
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = node('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function editorControls() {
    for (const field of $('iot-device-form').querySelectorAll('input,select,button'))
      field.disabled = managing;
    $('iot-plant').disabled = managing || !!editingId;
    for (const id of ['iot-source-id', 'iot-meter-id', 'iot-profile']) $(id).readOnly = !!editingId;
    $('iot-display-name').disabled = managing || !cardReady;
  }
  function edit(device = null) {
    clearCredential();
    editingId = device?.device_id || null;
    $('iot-device-form').reset();
    $('iot-display-name').value = device?.display_name || '';
    if (device)
      for (const [id, key] of [
        ['iot-source-id', 'device_id'],
        ['iot-meter-id', 'meter_id'],
        ['iot-profile', 'meter_profile'],
        ['iot-plant', 'plant'],
      ])
        $(id).value = device[key];
    $('iot-submit').dataset.i18n = editingId ? 'iotSaveName' : 'iotCreate';
    $('iot-submit').textContent = t($('iot-submit').dataset.i18n);
    $('iot-binding-help').dataset.i18n = editingId ? 'iotNameHelp' : 'iotBindingHelp';
    $('iot-binding-help').textContent = t($('iot-binding-help').dataset.i18n);
    editorControls();
    $('iot-device-form').hidden = false;
    $(editingId ? 'iot-display-name' : 'iot-source-id').focus();
  }
  function clearManagement() {
    scope++;
    manualController?.abort();
    manualController = null;
    statusController?.abort();
    statusController = null;
    clearTimeout(statusTimer);
    clearTimeout(reloadTimer);
    manualBusy = false;
    stopButtons();
    controls = [];
    checked = false;
    writeController?.abort();
    managing = false;
    cloudEndpoint = null;
    editingId = null;
    cardReady = false;
    $('iot-show-archived').checked = false;
    $('iot-archived-control').hidden = true;
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
    readNotice = '';
    requestLocks.clear();
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
    statusController?.abort();
    statusController = null;
    clearTimeout(statusTimer);
    clearTimeout(reloadTimer);
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
      if ($('iot-show-archived').checked && getUser()?.role === 'admin')
        query.set('include_archived', '1');
      if ($('iot-kind').value) query.set('event_type', $('iot-kind').value);
      const data = await request('/api/iot-readings?' + query, { signal: controller.signal });
      if (epoch !== identity || !dialog.open) return;
      $('iot-management').hidden = !data.enabled || getUser()?.role !== 'admin';
      cloudEndpoint = data.connection?.endpoint || null;
      cardReady = data.connection?.card_management_ready === true;
      $('iot-archived-control').hidden = getUser()?.role !== 'admin' || !cardReady;
      manualEnabled = !!data.connection?.manual_refresh_enabled;
      checked = true;
      $('iot-add').disabled = managing || !cloudEndpoint;
      $('iot-cloud-status').textContent = t(
        data.connection?.endpoint ? 'iotCloudReady' : 'iotCloudMissing',
      );
      if (getUser()?.role === 'admin' && !cardReady)
        $('iot-cloud-status').textContent += ' ' + t('iotManagementNotReady');
      const host = $('iot-data');
      hasPending = false;
      stopPresence();
      host.replaceChildren();
      $('iot-status').textContent = t(
        readNotice ||
          (!data.enabled
            ? 'iotNotConfigured'
            : !data.devices.length
              ? 'iotNoDevices'
              : !data.readings.length
                ? data.devices.some((device) => device.latest_reading)
                  ? 'iotNoMatches'
                  : 'iotNoReadings'
                : 'iotUpdated'),
      );
      if (data.enabled) {
        const list = node('div', null, 'iot-devices');
        controls = [];
        for (const d of data.devices) {
          const card = node('section', null, 'iot-device-card');
          const badge = node('span', null, 'iot-presence');
          const contact = node('p');
          presenceBadges.push({ device: d, badge, contact, date });
          card.append(
            node('strong', (d.display_name || d.device_id) + ' · ' + d.plant),
            node(
              'p',
              (d.display_name ? d.device_id + ' · ' : '') + d.meter_id + ' / ' + d.meter_profile,
            ),
            badge,
            contact,
          );
          if (d.archived_at) card.append(node('span', t('iotRemoved'), 'iot-presence'));
          if (d.latest_reading) {
            const latest = d.latest_reading;
            card.append(
              node('p', t('iotLatest'), 'iot-meta'),
              node(
                'strong',
                formatIotReading(latest.readings.active_energy_kwh) + ' kWh',
                'iot-reading',
              ),
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
          fuse(read);
          read.addEventListener('click', () => void requestNow(d.device_id));
          if (data.connection?.manual_refresh_enabled) {
            card.append(read);
            controls.push({ d, read, label, count });
            if (d.refresh_pending) hasPending = true;
          }
          if (getUser()?.role === 'admin') {
            const actions = node('div', null, 'iot-actions');
            const config = iotConnectionConfig(d, cloudEndpoint);
            const connectionButton = node('button', t('iotConnectionJson'), 'button secondary');
            connectionButton.type = 'button';
            connectionButton.dataset.iotAction = 'config';
            connectionButton.disabled = managing || !config;
            connectionButton.addEventListener('click', () =>
              download(
                config,
                'iot-connection-' + d.device_id + '.json',
                'application/json;charset=utf-8',
              ),
            );
            actions.append(connectionButton);
            const editButton = node('button', t('iotEdit'), 'button secondary');
            editButton.type = 'button';
            editButton.dataset.iotAction = 'edit';
            editButton.disabled = managing || !cardReady || !!d.archived_at;
            editButton.addEventListener('click', () => edit(d));
            actions.append(editButton);
            for (const action of d.archived_at ? ['restore'] : ['rotate', 'revoke', 'delete']) {
              const labels = {
                rotate: 'iotRotate',
                revoke: 'iotDisable',
                delete: 'iotRemove',
                restore: 'iotRestore',
              };
              const confirms = {
                rotate: 'iotRotateConfirm',
                revoke: 'iotDisableConfirm',
                delete: 'iotRemoveConfirm',
                restore: 'iotRestoreConfirm',
              };
              const button = node('button', t(labels[action]), 'button secondary');
              button.type = 'button';
              button.dataset.iotAction = action;
              button.disabled =
                managing ||
                (action === 'revoke' && !d.active) ||
                (['delete', 'restore'].includes(action) && !cardReady);
              button.addEventListener('click', () => {
                if (window.confirm(t(confirms[action])))
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
            formatIotReading(r.payload.readings.active_energy_kwh) + ' kWh',
            currentText(r.payload.readings),
          ])
            tr.append(node('td', v));
          body.append(tr);
        }
        table.append(body);
        wrap.append(table);
        if (data.readings.length) host.append(wrap);
        watchPresence(data.server_time);
        paintButtons();
        if (controls.length && !document.hidden) buttonTimer = setInterval(paintButtons, 1000);
      }
    } catch (error) {
      if (epoch === identity && (error.name !== 'AbortError' || timedOut)) {
        checked = false;
        paintPresence(NaN);
        paintButtons();
        stopPresence();
        $('iot-status').textContent = t('iotLoadFailed');
      }
    } finally {
      clearTimeout(timeout);
      if (epoch === identity) {
        const remaining = Math.max(
          0,
          IOT_MANUAL_COOLDOWN_SECONDS * 1000 - (performance.now() - lastReloadAt),
        );
        $('iot-refresh').disabled = remaining > 0;
        if (dialog.open && !document.hidden) {
          if ($('iot-auto').checked) timer = setTimeout(refresh, IOT_DASHBOARD_POLL_MS);
          scheduleStatus();
        }
        if (remaining > 0)
          reloadTimer = setTimeout(() => {
            if (
              epoch === identity &&
              dialog.open &&
              !document.hidden &&
              performance.now() - lastReloadAt >= IOT_MANUAL_COOLDOWN_SECONDS * 1000
            )
              $('iot-refresh').disabled = false;
          }, remaining + 10);
      }
    }
  }
  async function manage(body) {
    if (managing || getUser()?.role !== 'admin' || !dialog.open) return;
    const epoch = scope;
    managing = true;
    editorControls();
    paintButtons();
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
      editingId = null;
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
            IOT_MANAGEMENT_NOT_READY: 'iotManagementNotReady',
            DEVICE_ARCHIVED: 'iotRemoved',
          }[error.message] || 'iotManageFailed',
        );
    } finally {
      clearTimeout(timeout);
      if (epoch === scope && dialog.open) {
        managing = false;
        for (const button of $('iot-management').querySelectorAll('button'))
          button.disabled = false;
        editorControls();
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
    edit();
  });
  $('iot-cancel').addEventListener('click', () => {
    $('iot-device-form').hidden = true;
  });
  $('iot-device-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('iot-display-name').value.trim();
    if (!validIotName(name)) {
      $('iot-manage-status').textContent = t('iotNameInvalid');
      return;
    }
    if (editingId) {
      void manage({ action: 'update', device_id: editingId, display_name: name });
      return;
    }
    void manage({
      action: 'create',
      plant: $('iot-plant').value,
      device_id: $('iot-source-id').value,
      meter_id: $('iot-meter-id').value,
      meter_profile: $('iot-profile').value,
      ...(name ? { display_name: name } : {}),
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
    download(text, 'iot_credentials.local.h', 'text/plain;charset=utf-8');
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
  $('iot-show-archived').addEventListener('change', refresh);
  $('iot-auto').addEventListener('change', () => {
    clearTimeout(timer);
    clearTimeout(statusTimer);
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
      statusController?.abort();
      statusController = null;
      clearTimeout(statusTimer);
      clearTimeout(reloadTimer);
      stopButtons();
      manualController?.abort();
      manualController = null;
      manualBusy = false;
      hasPending = false;
      paintPresence(NaN);
      clearTimeout(presenceTimer);
      const hadKey = !!$('iot-key').value;
      clearCredential();
      if (hadKey) $('iot-manage-status').textContent = t('iotKeyCleared');
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
