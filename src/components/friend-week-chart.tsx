import { fromLbs, type Units } from "@/lib/units";

/**
 * A friend's last seven days, drawn small.
 *
 * Deliberately not Recharts. The weight tab already pays for that library; the
 * friends tab does not, and importing it here would put the whole chart runtime
 * on a route that needs one seven-point line. This is an inline polyline —
 * fewer lines of code than configuring a `<LineChart>` would have been.
 *
 * The y-range is the week's own spread, not the account's, so a quiet week
 * still reads as movement rather than a flat line. That is the opposite of the
 * main chart's rule on purpose: this one answers "how has their week gone",
 * where the main one answers "where am I against my goal".
 */
export function FriendWeekChart({
  week,
  units,
}: {
  week: Array<{ date: string; lbs: number | null }>;
  units: Units;
}) {
  const points = week
    .map((d, i) => ({ ...d, i }))
    .filter((d): d is { date: string; lbs: number; i: number } => d.lbs !== null);

  if (points.length < 2) {
    return (
      <p className="mt-3 text-xs text-ink-muted">
        {points.length === 0
          ? "No weigh-ins in the last seven days."
          : "One weigh-in this week — not enough to draw a line yet."}
      </p>
    );
  }

  const W = 280;
  const H = 60;
  const PAD = 8;
  const values = points.map((p) => p.lbs);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // A perfectly flat week would divide by zero; give it a nominal spread so the
  // line lands mid-height instead of at the top edge.
  const span = hi - lo || 1;

  const x = (i: number) => (i / 6) * (W - PAD * 2) + PAD;
  const y = (lbs: number) => H - PAD - ((lbs - lo) / span) * (H - PAD * 2);
  const path = points.map((p) => `${x(p.i)},${y(p.lbs)}`).join(" ");

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Weight over the last seven days, ${fromLbs(lo, units).toFixed(1)} to ${fromLbs(hi, units).toFixed(1)} ${units}`}
      >
        <polyline
          points={path}
          fill="none"
          stroke="var(--trace)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p) => (
          <circle
            key={p.date}
            cx={x(p.i)}
            cy={y(p.lbs)}
            r={2.5}
            fill="var(--trace)"
          />
        ))}
      </svg>
      <p className="tnum mt-1 flex justify-between text-[0.7rem] text-ink-faint">
        <span>
          {fromLbs(lo, units).toFixed(1)} low
        </span>
        <span>
          {fromLbs(hi, units).toFixed(1)} high
        </span>
      </p>
    </div>
  );
}
