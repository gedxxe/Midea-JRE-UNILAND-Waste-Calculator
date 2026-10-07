import { formatBlankReadingTemplate } from '../raw-export.js';
import { t } from '../i18n/index.js';
import { $ } from './dom.js';

export function initRawTemplate({ getPlant, toast }) {
  const dialog = $('raw-template-dialog');
  const factory = $('raw-template-plant');
  const preview = $('raw-template-preview');
  const render = () => {
    preview.value = formatBlankReadingTemplate(factory.value);
    preview.scrollTop = 0;
  };
  for (const button of document.querySelectorAll('[data-open-raw-template]')) {
    button.addEventListener('click', () => {
      factory.value = getPlant();
      render();
      dialog.showModal();
    });
  }
  factory.addEventListener('change', render);
  $('copy-raw-template').addEventListener('click', async () => {
    const text = preview.value;
    try {
      await navigator.clipboard.writeText(text);
      if (dialog.open && preview.value === text) toast(t('copied'));
    } catch {
      if (!dialog.open || preview.value !== text) return;
      preview.focus();
      preview.select();
      toast(t('clipboard'));
    }
  });
  $('download-raw-template').addEventListener('click', () => {
    const url = URL.createObjectURL(
      new Blob([preview.value], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${factory.value.toLowerCase()}-blank-readings.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
