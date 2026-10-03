import { PLANT_SCHEMAS } from './schema.js';

// Revalidate saved import warnings against today's schema, without changing readings.
export function currentRatioIssues(plant, issues) {
  return (Array.isArray(issues) ? issues : []).flatMap((item) => {
    if (!item || item.code !== 'RATIO_MISMATCH' || typeof item.message !== 'string') return [];
    const { rowIndex, meterIndex } = item;
    if (!Number.isInteger(rowIndex) || !Number.isInteger(meterIndex)) return [];
    const row = PLANT_SCHEMAS[plant]?.rows[rowIndex],
      factor = row?.factors[meterIndex];
    if (factor === undefined) return [];
    const prefix = `${row.name}, meter ${meterIndex + 1}: input ratio `;
    // Version-4 drafts originally stored only the parser's English message.
    const legacy = item.message.startsWith(prefix)
      ? item.message
          .slice(prefix.length)
          .match(/^(\S+), template ratio \S+\. Using the template ratio\.$/)
      : null;
    const inputRatio =
      typeof item.inputRatio === 'number' ? item.inputRatio : legacy ? Number(legacy[1]) : null;
    if (inputRatio === factor) return [];
    return [
      {
        code: 'RATIO_MISMATCH',
        level: 'WARNING',
        rowIndex,
        meterIndex,
        ...(Number.isFinite(inputRatio) ? { inputRatio } : {}),
        message:
          inputRatio !== null && !Number.isNaN(inputRatio)
            ? `${prefix}${inputRatio}, template ratio ${factor}. Using the template ratio.`
            : item.message.slice(0, 500),
      },
    ];
  });
}
