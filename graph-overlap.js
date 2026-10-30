export const graphHasValues = (record) => Object.values(record.values || {}).some(Number.isFinite);

// Compare only periods containing plottable values; empty copies cannot obscure a point.
export function relatedGraphPeriods(record, records) {
  if (!graphHasValues(record)) return [];
  return records.filter(
    (other) =>
      other !== record &&
      !other.superseded &&
      graphHasValues(other) &&
      (other.periodKind || 'daily') === (record.periodKind || 'daily') &&
      record.startDate < other.endDate &&
      other.startDate < record.endDate,
  );
}
