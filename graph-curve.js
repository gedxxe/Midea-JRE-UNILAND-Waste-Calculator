// Shape-preserving cubic segments. The curve joins observations, not estimated readings.
export function smoothPath(points) {
  if (!points.length) return '';
  const start = 'M' + points[0].join(' ');
  if (points.length < 3)
    return (
      start +
      points
        .slice(1)
        .map((p) => 'L' + p.join(' '))
        .join(' ')
    );
  const slopes = points.slice(1).map((p, i) => (p[1] - points[i][1]) / (p[0] - points[i][0]));
  const tangents = points.map((_, i) => {
    if (!i) return slopes[0];
    if (i === points.length - 1) return slopes[i - 1];
    const a = slopes[i - 1],
      b = slopes[i];
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  slopes.forEach((slope, i) => {
    if (!slope) tangents[i] = tangents[i + 1] = 0;
    else {
      const a = tangents[i] / slope,
        b = tangents[i + 1] / slope;
      const length = Math.hypot(a, b);
      if (length > 3) {
        tangents[i] = (3 * a * slope) / length;
        tangents[i + 1] = (3 * b * slope) / length;
      }
    }
  });
  return (
    start +
    points
      .slice(1)
      .map((point, i) => {
        const previous = points[i],
          dx = (point[0] - previous[0]) / 3;
        return (
          'C' +
          [
            previous[0] + dx,
            previous[1] + tangents[i] * dx,
            point[0] - dx,
            point[1] - tangents[i + 1] * dx,
            ...point,
          ].join(' ')
        );
      })
      .join(' ')
  );
}
