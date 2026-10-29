// Keep a results sidebar sticky only while its complete content fits the viewport.
// Taller cards retain normal document scrolling, so Copy report is always reachable.
export function fitResultsColumn(column) {
  function measure() {
    const columns = getComputedStyle(column.parentElement).gridTemplateColumns.split(' ').length;
    const fits = columns > 1 && column.offsetHeight + 36 <= innerHeight;
    column.dataset.sticky = String(fits);
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
  observer?.observe(column);
  window.addEventListener('resize', measure);
  measure();
}
