/** Inline SVG trend line for an ideas series. No chart library for 20 points. */
export function Sparkline({
  series,
  className = "h-6 w-24",
}: {
  series: [string, number][];
  className?: string;
}) {
  if (series.length < 2) return null;
  const values = series.map(([, v]) => v);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 100 - ((v - min) / span) * 100;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
