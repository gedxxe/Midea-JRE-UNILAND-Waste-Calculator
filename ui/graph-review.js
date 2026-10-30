import { node } from './dom.js';
import { getLanguage, t } from '../i18n/index.js';
import { graphPeriodLabel, graphSourceLabel, graphRecordStatus } from '../graph-presentation.js';
import { relatedGraphPeriods } from '../graph-overlap.js';

// Shared, value-free date diagnostics above all charts and the monthly table.
export function renderGraphReview(records, showCheckpoints) {
  const relevant = records.filter(
    (r) => r.overlap || r.noValues || (r.autosaved && r.complete === false),
  );
  if (!relevant.length) return null;
  const details = node('details', undefined, 'graph-data graph-period-review');
  details.open = relevant.some((r) => r.overlap);
  details.append(node('summary', t('graphReviewPeriods', { count: relevant.length })));
  const scroller = node('div', undefined, 'graph-data-scroll');
  scroller.tabIndex = 0;
  scroller.setAttribute('role', 'region');
  scroller.setAttribute('aria-label', t('graphReviewDates'));
  const table = node('table'),
    head = node('thead'),
    headers = node('tr'),
    body = node('tbody');
  for (const key of ['graphPeriod', 'graphSource', 'graphReviewReason', 'graphRelatedPeriods']) {
    const header = node('th', t(key));
    header.scope = 'col';
    headers.append(header);
  }
  head.append(headers);
  table.append(head);
  for (const record of relevant) {
    const row = node('tr');
    row.append(
      node('td', graphPeriodLabel(record, getLanguage())),
      node('td', graphSourceLabel(record, t)),
      node('td', graphRecordStatus(record, t)),
    );
    const related = node('td');
    for (const other of relatedGraphPeriods(record, records))
      related.append(node('p', graphPeriodLabel(other, getLanguage())));
    row.append(related);
    body.append(row);
  }
  table.append(body);
  scroller.append(table);
  details.append(scroller, node('p', t('graphReviewKept'), 'small muted'));
  if (
    showCheckpoints &&
    relevant.some((r) => r.autosaved && r.complete === false && r.checkpointRevision > 0)
  ) {
    const button = node('button', t('graphViewCheckpoints'), 'button secondary');
    button.type = 'button';
    button.dataset.graphCheckpoints = '';
    button.addEventListener('click', showCheckpoints);
    details.append(button);
  }
  return details;
}
