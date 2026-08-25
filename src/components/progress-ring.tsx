/**
 * Goal progress as a ring, with the current reading inside it.
 *
 * A ring reads as "how far round am I" at a glance, which is the question this
 * number answers. The percentage is also written out, because an arc alone is
 * hard to read precisely.
 *
 * The arc sweeps up to its value when the tab opens. Pure CSS: the dash offset
 * animates from a full circumference (empty) to zero (the drawn length), so
 * nothing has to be measured or tweened in JavaScript, and the global
 * reduced-motion override switches it off along with everything else.
 *
 * The stroke warms from the trace colour toward the reward gold as progress
 * climbs — approaching the goal is visible every morning, not only at the
 * quarters. `complete` swaps the arc for the full-circle rainbow ombre: the
 * finished cut's trophy, permanent until a new goal starts a new cut.
 */
export function ProgressRing({
  percent,
  value,
  unit,
  caption,
  complete = false,
  size = 168,
}: {
  percent: number | null;
  value: string;
  unit: string;
  caption: string;
  complete?: boolean;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled =
    percent === null ? 0 : (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={
          complete
            ? `${value} ${unit} — goal reached`
            : percent === null
              ? `${value} ${unit}`
              : `${Math.round(percent)} percent of the way from your start weight to your goal`
        }
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-sunk)"
          strokeWidth={stroke}
        />
        {percent !== null && !complete && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`color-mix(in oklab, var(--reward) ${Math.round(
              Math.min(100, Math.max(0, percent)) * 0.6,
            )}%, var(--trace))`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            // Start at twelve o'clock rather than three.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="ring-sweep"
            style={{ "--ring-arc": `${filled}px` } as React.CSSProperties}
          />
        )}
      </svg>

      {complete && <div aria-hidden className="ring-rainbow absolute inset-0" />}

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="tnum text-4xl font-bold leading-none">{value}</p>
        <p className="mt-0.5 text-sm font-bold text-ink-faint">{unit}</p>
        <p className="mt-1 text-xs text-ink-muted">{caption}</p>
      </div>
    </div>
  );
}
