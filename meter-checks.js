import { formatNumber } from './numbers.js';

export function groupIncludedMeters(children) {
  const groups = new Map();
  for (const child of children) {
    const key = child.name;
    if (!groups.has(key))
      groups.set(key, { name: child.name, rowIndex: child.rowIndex, meters: [], energy: 0 });
    const group = groups.get(key);
    group.meters.push(child.meterIndex + 1);
    group.energy =
      group.energy === null || child.energy === null ? null : group.energy + child.energy;
  }
  return [...groups.values()];
}
export function meterCheckLabel(item) {
  return item.name + (item.meterIndex === null ? '' : ', meter ' + (item.meterIndex + 1));
}
export function comparisonMessage(comparison, unavailable = false) {
  const { parent, children, total, excess } = comparison;
  const label = meterCheckLabel(parent);
  const groups = groupIncludedMeters(
    unavailable ? children.filter((c) => c.energy === null) : children,
  );
  const names = groups
    .map(
      (g) =>
        g.name +
        ', meter' +
        (g.meters.length === 1 ? ' ' : 's ') +
        g.meters.join(', ') +
        (unavailable ? '' : ' = ' + formatNumber(g.energy, 8) + ' ' + parent.unit),
    )
    .join('; ');
  return unavailable
    ? label + ': enter valid readings for ' + names + ' to calculate net usage.'
    : label +
        ': included meters use ' +
        formatNumber(total, 8) +
        ' ' +
        parent.unit +
        ", above this meter's " +
        formatNumber(parent.energy, 8) +
        ' ' +
        parent.unit +
        ' by ' +
        formatNumber(excess, 8) +
        ' ' +
        parent.unit +
        '. Included: ' +
        names +
        '. Check these readings for the same period.';
}
