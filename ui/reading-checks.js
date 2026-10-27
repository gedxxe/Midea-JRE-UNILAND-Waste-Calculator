import { node } from './dom.js';
import { formatNumber } from '../numbers.js';
import { groupIncludedMeters } from '../meter-checks.js';
import { readingText, readingIssueMessage } from '../i18n/reading-feedback.js';

export function renderReadingChecks(list, issues, plant, focus) {
  list.replaceChildren(
    ...[...issues]
      .sort((a, b) => Number(!!b.comparison) - Number(!!a.comparison))
      .map((issue) => {
        const li = node('li');
        const actionable =
          (issue.rowIndex !== null && issue.rowIndex !== undefined) || issue.target;
        if (!actionable) {
          li.textContent = readingIssueMessage(issue, plant);
          return li;
        }
        const button = node('button', readingIssueMessage(issue, plant));
        button.type = 'button';
        button.addEventListener('click', () => focus(issue));
        li.append(button);
        if (!issue.comparison) return li;
        li.classList.add('meter-comparison');
        const c = issue.comparison,
          unit = c.parent.unit;
        li.append(
          node(
            'p',
            readingText('parent') +
              ': ' +
              formatNumber(c.parent.energy, 8) +
              ' ' +
              unit +
              ' · ' +
              readingText('total') +
              ': ' +
              formatNumber(c.total, 8) +
              ' ' +
              unit,
            'comparison-values',
          ),
        );
        const groups = node('ul');
        for (const group of groupIncludedMeters(c.children)) {
          const item = node('li'),
            name = node('strong', group.name);
          item.append(name);
          for (const child of c.children.filter((child) => child.name === group.name)) {
            const label =
              readingText('meter', { meter: child.meterIndex + 1 }) +
              ': ' +
              formatNumber(child.energy, 8) +
              ' ' +
              unit;
            const link = node('button', label, 'comparison-meter');
            link.type = 'button';
            link.dataset.relatedRow = String(child.rowIndex);
            link.dataset.relatedMeter = String(child.meterIndex);
            link.setAttribute('aria-label', group.name + ', ' + label);
            link.addEventListener('click', () =>
              focus({ rowIndex: child.rowIndex, meterIndex: child.meterIndex }),
            );
            item.append(link);
          }
          groups.append(item);
        }
        li.append(groups);
        return li;
      }),
  );
}
