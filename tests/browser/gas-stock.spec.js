import { test, expect, modernWorkspace } from './fixtures.js';
import { excelWorkspace } from '../fixtures/excel-periods.mjs';
import { gasPoint, GAS_TABLE_VERSION } from '../../gas.js';
import { periodKey, workspaceDrafts } from '../../draft-records.js';
import { sameWorkspace } from '../../storage.js';
import { exampleDraft } from '../../examples.js';
import { reportSnapshot } from '../../server/report-data.js';

for (const plant of ['JRE', 'UNILAND'])
  test(
    plant + ' stock increase stays visible, copyable and saveable across languages and reload',
    async ({ page, context }, info) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      const point = (reading) => ({ reading, temperature: '' });
      const draft = exampleDraft(plant);
      draft.gas.entries[2] = {
        enabled: true,
        start: point('1000'),
        end: point('1050'),
        refills: [],
      };
      const expected = reportSnapshot(draft).output.reportText;
      const workspace = {
        version: 4,
        drafts: { JRE: exampleDraft('JRE'), UNILAND: exampleDraft('UNILAND'), [plant]: draft },
      };
      await page.route('**/api/auth', (r) =>
        r.fulfill({
          json: {
            available: true,
            user: {
              id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
              username: 'gas-test',
              role: 'operator',
              mustChangePassword: false,
            },
          },
        }),
      );
      await page.route('**/api/time', (r) =>
        r.fulfill({
          json: {
            unixMs: Date.UTC(2026, 8, 16, 1),
            source: 'time.cloudflare.com',
            protocol: 'NTP',
            stratum: 2,
            sampleAgeMs: 0,
            uncertaintyMs: 5,
          },
        }),
      );
      let version = 1,
        reads = 0;
      await page.route('**/api/drafts', (r) => {
        if (r.request().method() === 'POST') {
          Object.assign(workspace, r.request().postDataJSON().workspace);
          version++;
        } else reads++;
        return r.fulfill({ json: { workspace, version, updated_at: '2026-09-16T01:00:00Z' } });
      });
      let checkpoints = 0;
      await page.route('**/api/reports', (r) => {
        if (r.request().method() !== 'POST') return r.fulfill({ json: { reports: [] } });
        checkpoints++;
        return r.fulfill({ status: 500, json: { error: 'Unexpected checkpoint write' } });
      });
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/');
      await page.locator('[data-plant="' + plant + '"]').click();
      const gas = page.locator('[data-gas="N2"]');
      const value = plant === 'JRE' ? '+172.91' : '+172.23';
      await expect(gas.locator('.gas-total')).toHaveText(
        'Measured stock increase: ' + value + ' kg',
      );
      await expect(gas.locator('[data-utility]')).toHaveValue(value);
      await expect(gas.locator('.gas-status')).toHaveAttribute('data-notice', 'true');
      await expect(gas.locator('[data-gas-point="end"]')).toHaveAttribute('aria-invalid', 'false');
      await expect(page.locator('#report-preview')).toHaveValue(expected);
      await expect(page.locator('#copy-report')).toBeEnabled();
      await page.locator('#copy-report').click();
      await expect
        .poll(() =>
          page.evaluate(async () =>
            (await navigator.clipboard.readText()).replaceAll('\r\n', '\n'),
          ),
        )
        .toBe(expected);
      for (const [lang, label] of [
        ['zh-CN', '测得库存增加'],
        ['id', 'Kenaikan stok terukur'],
        ['en', 'Measured stock increase'],
      ]) {
        await page.locator('#language-select').selectOption(lang);
        await expect(gas.locator('.gas-total')).toHaveText(label + ': ' + value + ' kg');
        await expect(page.locator('#report-preview')).toHaveValue(expected);
      }
      await gas.scrollIntoViewIfNeeded();
      await gas.screenshot({ path: info.outputPath('gas-stock-increase.png') });
      const before = reads;
      await page.locator('#save-report').click();
      await expect.poll(() => reads).toBeGreaterThan(before);
      await expect(page.locator('#save-report')).not.toHaveAttribute('aria-busy', 'true');
      await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
      const saved = reportSnapshot(workspace.drafts[plant]);
      expect(saved.output.reportText).toBe(expected);
      expect(saved.output.gas[0].kg).toBeLessThan(0);
      expect(checkpoints).toBe(0);
      await page.reload();
      await page.locator('[data-plant="' + plant + '"]').click();
      await expect(gas.locator('.gas-total')).toHaveText(
        'Measured stock increase: ' + value + ' kg',
      );
      await gas.locator('[data-gas-point="end"]').fill('950');
      await expect(gas.locator('.gas-total')).toContainText('Consumption: ');
      await expect(gas.locator('.gas-status')).toBeEmpty();
      expect(await page.locator('#report-preview').inputValue()).not.toContain(
        '(measured stock increase)',
      );
      await gas.locator('[data-add-refill]').click();
      await gas.locator('[data-gas-point="before0"]').fill('990');
      await gas.locator('[data-gas-point="after0"]').fill('980');
      await expect(gas.locator('.gas-total')).toHaveText('Consumption: - kg');
      await expect(gas.locator('.gas-status')).toContainText('decreased during refill');
      await expect(page.locator('#copy-report')).toBeDisabled();
      expect(errors).toEqual([]);
    },
  );

async function setupR32(page, { legacy = false, recovery = false, conflict = false } = {}) {
  let workspace = modernWorkspace(excelWorkspace()),
    version = 1,
    reports = 0,
    writes = 0;
  for (const collection of ['drafts', 'workingHours', 'nightShifts']) {
    const gas = workspace[collection].JRE.gas;
    if (legacy) {
      gas.version = GAS_TABLE_VERSION;
      for (const p of [
        gas.entries[3].start,
        gas.entries[3].end,
        ...gas.entries[3].refills.flatMap((e) => [e.before, e.after]),
      ])
        delete p.unit;
    } else
      gas.entries[3] = {
        enabled: false,
        start: gasPoint('R32'),
        end: gasPoint('R32'),
        refills: [],
      };
  }
  if (recovery) {
    version = 2;
    workspace.drafts.JRE.gas.entries[3].end.reading = '799';
    workspace.nightShifts.JRE.gas.entries[3].end.reading = '799';
    await page.addInitScript(
      (workspace) =>
        sessionStorage.setItem(
          'midea_energy_draft_v4_b89c2b90-bbee-4a90-bd68-a0e9fc761352',
          JSON.stringify({
            ...workspace,
            tabRecovery: { version: 1, pending: true, pendingPeriods: [] },
          }),
        ),
      workspace,
    );
    if (conflict) {
      workspace.drafts.JRE.gas.entries[3].end.reading = '798';
      workspace.nightShifts.JRE.gas.entries[3].end.reading = '798';
    }
  }
  const legacyReadings = structuredClone(workspace),
    errors = [];
  const periods = new Map(
    workspaceDrafts(workspace).map((d) => [
      periodKey(d),
      { draft: structuredClone(d), version: 1 },
    ]),
  );
  const refs = () =>
    [...periods].map(([key, record]) => ({
      key,
      version: record.version,
      id: '1e61d60e-e4b5-4c91-b7d1-6a56d9465680',
      revision: 1,
    }));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/auth', (r) =>
    r.fulfill({
      json: {
        available: true,
        user: {
          id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
          username: 'r32-test',
          role: 'operator',
          mustChangePassword: false,
        },
      },
    }),
  );
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/drafts*', (r) => {
    const key = new URL(r.request().url()).searchParams.get('period');
    if (key)
      return r.fulfill({
        json: {
          key,
          draft: periods.get(key)?.draft || null,
          version: periods.get(key)?.version || 0,
        },
      });
    if (r.request().method() === 'POST') {
      writes++;
      const body = r.request().postDataJSON();
      if (body.baseVersion !== version)
        return r.fulfill({ status: 409, json: { error: 'DRAFT_CONFLICT' } });
      workspace = body.workspace;
      version++;
      for (const draft of [...(body.periods || []), ...workspaceDrafts(workspace)]) {
        const key = periodKey(draft),
          old = periods.get(key);
        if (key && (!old || !sameWorkspace(old.draft, draft)))
          periods.set(key, { draft: structuredClone(draft), version: (old?.version || 0) + 1 });
      }
    }
    return r.fulfill({
      json: {
        workspace,
        version,
        records: refs(),
        recordsChanged: true,
        updated_at: '2026-11-02T01:00:00Z',
      },
    });
  });
  await page.route('**/api/reports', (r) => {
    if (r.request().method() === 'POST') reports++;
    return r.fulfill({ json: { reports: [] } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app');
  await expect(page.locator('#save-status')).toContainText(
    conflict ? 'Another tab or device' : 'All changes saved',
  );
  await page.locator('#dismiss-guide').click();
  return {
    workspace: () => workspace,
    legacyReadings,
    errors,
    reports: () => reports,
    writes: () => writes,
  };
}
for (const [mode, collection, start, end, usage] of [
  ['daily', 'drafts', '1500.125', '1200.025', '300.1'],
  ['workingHours', 'workingHours', '1500.125', '1400.025', '100.1'],
  ['nightShift', 'nightShifts', '1400.025', '1200.025', '200'],
])
  test(`JRE ${mode} defaults to direct kg stock, copies raw kg and survives save/reload`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const model = await setupR32(page);
    await page.locator('#reading-mode').selectOption(mode);
    const card = page.locator('[data-gas="R32"]');
    await card.locator('[data-gas-enable]').check();
    for (const side of ['start', 'end']) {
      await expect(card.locator(`[data-gas-unit="${side}"]`)).toHaveValue('kg');
      await expect(card.locator(`[data-gas-unit="${side}"] option`).first()).toHaveValue('kg');
    }
    await expect(card.locator('[data-gas-temperature]')).toHaveCount(0);
    await card.locator('[data-gas-point="start"]').fill(start);
    await card.locator('[data-gas-point="end"]').fill(end);
    await expect(card.locator('.gas-total')).toHaveText(`Consumption: ${usage} kg`);
    await card.screenshot({ path: test.info().outputPath('r32-stock-kg.png') });
    await expect(card.locator('[data-gas-unit="end"]')).toBeDisabled();
    await expect(page.locator('#report-preview')).toHaveValue(
      new RegExp(`Refrigerant R32: ${usage.replace('.', '\\.')} Kg`),
    );
    const report = await page.locator('#report-preview').inputValue();
    await page.locator('#open-raw-export').click();
    await expect(page.locator('#raw-export-preview')).toHaveValue(
      new RegExp(`Refrigerant R32: ${end.replace('.', '\\.')} kg`),
    );
    const raw = await page.locator('#raw-export-preview').inputValue();
    expect(raw).not.toMatch(/Refrigerant R32:.*temperature/);
    await page.locator('#copy-raw-export').click();
    await expect
      .poll(() =>
        page.evaluate(async () =>
          (await navigator.clipboard.readText()).replaceAll(
            String.fromCharCode(13, 10),
            String.fromCharCode(10),
          ),
        ),
      )
      .toBe(raw);
    await page.locator('[data-close-dialog="raw-export-dialog"]').click();
    await page.keyboard.press('Control+s');
    await expect(page.locator('#save-status')).toContainText('All changes saved');
    expect(model.workspace()[collection].JRE.gas.entries[3].end).toEqual({
      reading: end,
      temperature: '',
      unit: 'kg',
    });
    for (const c of ['drafts', 'workingHours', 'nightShifts'])
      expect(model.workspace()[c].UNILAND.gas.entries[3]).toEqual(
        model.legacyReadings[c].UNILAND.gas.entries[3],
      );
    for (const language of ['zh-CN', 'id', 'en']) {
      await page.locator('#language-select').selectOption(language);
      await expect(page.locator('#report-preview')).toHaveValue(report);
    }
    await Promise.all([
      page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === '/api/drafts' &&
          r.request().method() === 'GET' &&
          r.status() === 200,
      ),
      page.reload(),
    ]);
    await expect(page.locator('#save-status')).toContainText('All changes saved');
    await page.locator('#reading-mode').selectOption(mode);
    await expect(card.locator('[data-gas-point="end"]')).toHaveValue(end);
    await expect(card.locator('[data-gas-temperature]')).toHaveCount(0);
    expect(model.reports()).toBe(0);
    expect(model.errors).toEqual([]);
  });

test('JRE kg refills and stock increases retain notices without asking for temperature', async ({
  page,
}) => {
  const model = await setupR32(page),
    card = page.locator('[data-gas="R32"]');
  await card.locator('[data-gas-enable]').check();
  await card.locator('[data-gas-point="start"]').fill('1000');
  await card.locator('[data-gas-point="end"]').fill('1150');
  await expect(card.locator('.gas-total')).toHaveText('Measured stock increase: +150 kg');
  await expect(card).toHaveAttribute('data-state', 'attention');
  await expect(card.locator('.gas-status')).not.toContainText('temperature');
  await card.locator('[data-gas-point="end"]').fill('');
  await expect(card.locator('[data-gas-unit="end"]')).toBeEnabled();
  await card.locator('[data-gas-unit="end"]').selectOption('mm');
  await expect(card.locator('[data-gas-point="end"]')).toHaveValue('');
  await card.locator('[data-gas-point="end"]').fill('550');
  await card.locator('[data-gas-temperature="end"]').fill('33.5');
  await expect(card.locator('[data-gas-point="start"]')).toHaveValue('1000');
  await card.locator('[data-gas-point="end"]').fill('');
  await card.locator('[data-gas-unit="end"]').selectOption('kg');
  await expect(card.locator('[data-gas-temperature]')).toHaveCount(0);
  await card.locator('[data-gas-point="end"]').fill('1150');
  await expect(card.locator('.gas-total')).toHaveText('Measured stock increase: +150 kg');
  await expect(page.locator('#copy-report')).toBeEnabled();
  await card.locator('[data-add-refill]').click();
  await card.locator('[data-gas-point="before0"]').fill('900');
  await card.locator('[data-gas-point="after0"]').fill('1300');
  await expect(card.locator('.gas-total')).toHaveText('Consumption: 250 kg');
  await expect(card.locator('[data-gas-temperature]')).toHaveCount(0);
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-status')).toContainText('All changes saved');
  expect(model.workspace().drafts.JRE.gas.entries[3].refills[0].after.unit).toBe('kg');
  await card.locator('[data-gas-point="after0"]').fill('800');
  await expect(card).toHaveAttribute('data-state', 'error');
  await expect(card.locator('.gas-status')).toContainText('Stock decreased');
  expect(model.errors).toEqual([]);
});

test('existing JRE mm observations keep their unit, interpolation and raw temperatures; UNILAND stays mm', async ({
  page,
}) => {
  const model = await setupR32(page, { legacy: true }),
    card = page.locator('[data-gas="R32"]');
  await expect(card.locator('[data-gas-unit="start"]')).toHaveValue('mm');
  await expect(card.locator('[data-gas-unit="start"]')).toBeDisabled();
  await expect(card.locator('[data-gas-temperature="start"]')).toHaveValue('30');
  await expect(card.locator('[data-gas-point="start"]')).toHaveValue('1000');
  const report = await page.locator('#report-preview').inputValue();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-status')).toContainText('All changes saved');
  await page.reload();
  await expect(page.locator('#report-preview')).toHaveValue(report);
  await expect(card.locator('[data-gas-unit="end"]')).toHaveValue('mm');
  await page.locator('[data-plant="UNILAND"]').click();
  await expect(card.locator('[data-gas-unit]')).toHaveCount(0);
  await expect(card.locator('[data-gas-temperature="end"]')).toHaveValue('30');
  expect(model.errors).toEqual([]);
});

test('an identical lost legacy save response survives the kg-format upgrade without a false conflict or extra write', async ({
  page,
}) => {
  const model = await setupR32(page, { legacy: true, recovery: true }),
    card = page.locator('[data-gas="R32"]');
  await expect(card.locator('[data-gas-point="end"]')).toHaveValue('799');
  await expect(card.locator('[data-gas-unit="end"]')).toHaveValue('mm');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-status')).toContainText('All changes saved');
  expect(model.workspace().drafts.JRE.gas.entries[3].end.reading).toBe('799');
  expect(model.writes()).toBe(0);
  expect(model.errors).toEqual([]);
});

test('a different stored legacy reading remains a conflict during the kg-format upgrade', async ({
  page,
}) => {
  const model = await setupR32(page, { legacy: true, recovery: true, conflict: true });
  await expect(page.locator('[data-gas="R32"] [data-gas-point="end"]')).toHaveValue('799');
  await expect(page.locator('#save-status')).toContainText('Another tab or device');
  expect(model.workspace().drafts.JRE.gas.entries[3].end.reading).toBe('798');
  expect(model.writes()).toBe(0);
  expect(model.errors).toEqual([]);
});
