import { $ } from './dom.js';
import { t } from '../i18n/index.js';
import { dayDiff, shiftDate } from '../numbers.js';
import { periodLabel } from '../graph-axis.js';

export function createPeriodPicker({ current, apply }) {
  function preview() {
    const start = $('combined-start').value,
      last = $('combined-last').value;
    const days = dayDiff(start, last),
      end = shiftDate(last, 1);
    const valid = days !== null && days >= 0 && !!end && end <= '2099-12-31';
    $('combined-apply').disabled = !valid;
    $('combined-preview').textContent = valid
      ? t('combinedPreview', {
          period: periodLabel(start, end),
          start,
          end,
          days: days + 1,
        })
      : t('combinedInvalid');
  }
  for (const id of ['combined-start', 'combined-last']) $(id).addEventListener('input', preview);
  $('combined-apply').addEventListener('click', () => {
    preview();
    if ($('combined-apply').disabled) return;
    apply($('combined-start').value, shiftDate($('combined-last').value, 1));
  });
  return {
    sync() {
      $('combined-start').value = current().startDate;
      $('combined-last').value = shiftDate(current().endDate, -1) || '';
      preview();
    },
  };
}
