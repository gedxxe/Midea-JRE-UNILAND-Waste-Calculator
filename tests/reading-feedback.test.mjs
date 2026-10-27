import test from 'node:test';
import assert from 'node:assert/strict';
import { setLanguage } from '../i18n/index.js';
import { readingText, readingIssueMessage, importFeedback } from '../i18n/reading-feedback.js';
import { parseReading } from '../importer.js';
import { formatBlankReadingTemplate } from '../raw-export.js';
test('import feedback is bounded and complete in all three interface languages', () => {
  const text = formatBlankReadingTemplate('UNILAND')
    .replace('DD/MM/YYYY', '27/10/2026')
    .replaceAll('____', 'invalid');
  const parsed = parseReading(text, 'UNILAND');
  for (const lang of ['en', 'zh-CN', 'id']) {
    setLanguage(lang);
    const output = importFeedback(parsed, 'UNILAND');
    assert.equal(output.split('\n').length, 6);
    assert.ok(!output.includes('undefined'));
    assert.ok(!output.includes('{'));
    assert.ok(output.includes('Total'));
    assert.ok(readingText('format', { plant: 'UNILAND', rows: 34, meters: 48 }).includes('48'));
    const message = readingIssueMessage(
      {
        code: 'NET_USAGE_NEGATIVE',
        comparison: { parent: { name: 'Piping', meterIndex: 2, unit: 'kWh' }, excess: 0.01 },
      },
      'JRE',
    );
    assert.ok(message.includes('3'));
    assert.ok(message.includes('0.01 kWh'));
  }
  setLanguage('en');
});
