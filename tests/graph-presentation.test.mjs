import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPH_METRICS, defaultGraphs, validGraph } from '../graph-schema.js';
import { metricLabels } from '../i18n/graph-labels.js';
import {
  metricLabel,
  graphTitleField,
  graphDepartment,
  upgradeGraph,
  graphPeriodLabel,
} from '../graph-presentation.js';
import { graphPeriodText } from '../reading-period.js';

test('all current graph metrics have explicit display labels in three languages without changing canonical identities', () => {
  const before = structuredClone(GRAPH_METRICS);
  for (const metrics of Object.values(GRAPH_METRICS))
    for (const metric of metrics) {
      assert.equal(metricLabels[metric.label]?.length, 3, metric.label);
      for (const language of ['en', 'zh-CN', 'id']) assert.ok(metricLabel(metric, language).trim());
    }
  assert.equal(
    metricLabel(
      GRAPH_METRICS.JRE.find((m) => m.key === 'w2'),
      'en',
    ),
    'Window A',
  );
  assert.equal(
    metricLabel(
      GRAPH_METRICS.JRE.find((m) => m.key === 'w3'),
      'zh-CN',
    ),
    '窗机 B',
  );
  assert.notEqual(
    metricLabel(
      GRAPH_METRICS.JRE.find((m) => m.key === 'w16'),
      'en',
    ),
    metricLabel(
      GRAPH_METRICS.JRE.find((m) => m.key === 'r30'),
      'en',
    ),
  );
  assert.deepEqual(GRAPH_METRICS, before);
});

test('browser layout upgrades shorten known preset titles and retain all workbook selections, bounds and chart counts', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const old = defaultGraphs(plant),
      before = structuredClone(old),
      next = old.map((c) => upgradeGraph(plant, c));
    assert.equal(next.length, plant === 'JRE' ? 9 : 7);
    assert.deepEqual(
      next.map((c) => c.series),
      old.map((c) => c.series),
    );
    for (const config of next) {
      assert.deepEqual(validGraph(plant, config), config);
      assert.deepEqual(upgradeGraph(plant, config), config);
      for (const language of ['en', 'zh-CN', 'id']) {
        const title = config[graphTitleField(language)];
        assert.ok(title.startsWith(plant + ' · '));
        assert.ok(title.length < 55);
      }
    }
    assert.equal(next.filter((c) => graphDepartment(plant, c) === 'branch').length, 2);
    assert.deepEqual(old, before);
  }
});

test('custom legacy titles and manual axes survive a display upgrade without editing the source layout', () => {
  const old = {
    ...defaultGraphs('JRE')[0],
    titleEn: 'Custom <title> & trend',
    titleZh: '自定义图表',
    yAxis: { mode: 'manual', min: 100, max: 250 },
  };
  const before = structuredClone(old),
    next = upgradeGraph('JRE', old);
  assert.equal(next.titleEn, old.titleEn);
  assert.equal(next.titleZh, old.titleZh);
  assert.equal(next.titleId, 'JRE · Lini Produksi');
  assert.deepEqual(next.yAxis, old.yAxis);
  assert.deepEqual(next.series, old.series);
  assert.deepEqual(old, before);
  next.titleId = 'Grafik Utility';
  assert.equal(upgradeGraph('JRE', next).titleId, 'Grafik Utility');
  for (const titleId of [null, 42, 'x'.repeat(161)])
    assert.equal(upgradeGraph('JRE', { ...old, titleId }), null);
});

test('localized graph periods preserve combined dates and exact overnight timestamps', () => {
  const daily = { startDate: '2026-09-18', endDate: '2026-09-21', days: 3 };
  assert.match(graphPeriodLabel(daily, 'en'), /3 days\)$/);
  assert.match(graphPeriodLabel(daily, 'zh-CN'), /3 天\)$/);
  assert.match(graphPeriodLabel(daily, 'id'), /3 hari\)$/);
  const night = {
    ...daily,
    kind: 'nightShift',
    startTime: '17:00',
    endTime: '08:00',
    readingEndDate: '2026-09-19',
    minutes: 900,
  };
  for (const [language, unit] of [
    ['en', 'hours'],
    ['zh-CN', '小时'],
    ['id', 'jam'],
  ]) {
    const label = graphPeriodLabel(night, language);
    assert.ok(label.includes('2026-09-18 17:00 → 2026-09-19 08:00 WIB'));
    assert.ok(label.endsWith('15 ' + unit + ')'));
  }
  assert.equal(graphPeriodText(daily), '2026-09-18 08:00 → 2026-09-21 08:00 (3 days)');
});
