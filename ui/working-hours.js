import { $ } from './dom.js';
import { t } from '../i18n/index.js';
import { isWorkingHours } from '../reading-period.js';

export function createWorkingHoursPicker({ current, switchMode, changePeriod, copyMorning }) {
  $('reading-mode').addEventListener('change', () => switchMode($('reading-mode').value));
  for (const id of ['work-date', 'work-start-time', 'work-end-time'])
    $(id).addEventListener('change', () =>
      changePeriod($('work-date').value, $('work-start-time').value, $('work-end-time').value),
    );
  $('work-copy-morning').addEventListener('click', copyMorning);
  return {
    sync() {
      const draft = current(),
        working = isWorkingHours(draft);
      $('reading-mode').value = working ? 'workingHours' : 'daily';
      $('daily-period').hidden = working;
      $('combined-period').hidden = working;
      $('work-period').hidden = !working;
      $('gas-section').hidden = working;
      $('water-section').hidden = working;
      $('work-date').value = working ? draft.startDate : '';
      $('work-start-time').value = working ? draft.startTime : '';
      $('work-end-time').value = working ? draft.endTime : '';
      $('work-copy-morning').disabled = !working || draft.startTime !== '08:00';
      $('entry-intro').firstElementChild.textContent = t(working ? 'workIntro' : 'intro');
      for (const [side, key] of [
        ['start', 'workMorningReading'],
        ['end', 'workEveningReading'],
      ])
        $(side + '-reading-label').textContent = t(
          working ? key : side === 'start' ? 'startReading' : 'endReading',
        );
      $('page-title').textContent = working ? t('workTitle') : 'Daily energy report';
    },
  };
}
