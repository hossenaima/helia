/**
 * Goal progress as a ring, with the current reading inside it.
 *
 * A ring reads as "how far round am I" at a glance, which is the question this
 * number answers. The percentage is also written out, because an arc alone is
 * hard to read precisely.
 *
 * The arc is the rainbow itself, revealed from twelve o'clock as far as
 * progress has come — a conic gradient cannot be an SVG stroke, so it is a div
 * masked down to the ring's band, with a second, angular mask doing the
 * reveal (see `.ring-rainbow` in globals.css). At the goal the circle is
 * complete and stays complete: the finished cut's trophy, permanent until a
 * new goal starts a new cut. The SVG underneath only draws the resting track.
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
  const pct = complete
    ? 100
    : percent === null
      ? 0
      : Math.min(100, Math.max(0, percent));

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        complete
          ? `${value} ${unit} — goal reached`
          : percent === null
            ? `${value} ${unit}`
            : `${Math.round(percent)} percent of the way from your start weight to your goal`
      }
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-sunk)"
          strokeWidth={stroke}
        />
      </svg>

      {pct > 0 && (
        <div
          aria-hidden
          // At 100 the angular mask comes off entirely — its seam at twelve
          // o'clock leaves a hairline gap in what should be a closed circle.
          className={`ring-rainbow absolute inset-0 ${pct >= 100 ? "ring-rainbow-full" : ""}`}
          style={{ "--ring-pct": `${pct}%` } as React.CSSProperties}
        />
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="tnum text-4xl font-bold leading-none">{value}</p>
        <p className="mt-0.5 text-sm font-bold text-ink-faint">{unit}</p>
        <p className="mt-1 text-xs text-ink-muted">{caption}</p>
      </div>
    </div>
  );
}
