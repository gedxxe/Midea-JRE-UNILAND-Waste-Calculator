import { $ } from './dom.js';
import { t } from '../i18n/index.js';
import { isWorkingHours, isNightShift, periodKind } from '../reading-period.js';

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
      $('reading-mode').value = periodKind(draft);
      const night = isNightShift(draft);
      $('work-period-title').textContent = t(night ? 'nightTitle' : 'workTitle');
      $('work-start-time').previousElementSibling.textContent = t(
        night ? 'nightStart' : 'workStart',
      );
      $('work-end-time').previousElementSibling.textContent = t(night ? 'nightEnd' : 'workEnd');
      $('daily-period').hidden = working;
      $('combined-period').hidden = working;
      $('work-period').hidden = !working;
      $('gas-section').hidden = false;
      $('water-section').hidden = false;
      $('work-date').value = working ? draft.startDate : '';
      $('work-start-time').value = working ? draft.startTime : '';
      $('work-end-time').value = working ? draft.endTime : '';
      $('work-copy-morning').hidden = night;
      $('work-copy-morning').disabled = !working || night || draft.startTime !== '08:00';
      $('entry-intro').firstElementChild.textContent = t(working ? 'workIntro' : 'intro');
      for (const [side, key] of [
        ['start', 'workMorningReading'],
        ['end', 'workEveningReading'],
      ])
        $(side + '-reading-label').textContent = t(
          working
            ? night
              ? side === 'start'
                ? 'workEveningReading'
                : 'nextMorningReading'
              : key
            : side === 'start'
              ? 'startReading'
              : 'endReading',
        );
      $('next-day-hint').dataset.i18n = working ? 'workNextHint' : 'nextHint';
      $('next-day-hint').textContent = t(working ? 'workNextHint' : 'nextHint');
      $('page-title').textContent = working
        ? t(night ? 'nightTitle' : 'workTitle')
        : 'Daily energy report';
    },
  };
}
