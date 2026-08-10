import { dayKeyToDate } from "@/lib/dates";

/**
 * The last seven days at a glance: which ones you logged, and where today sits.
 * Pairs with the streak count, which is otherwise just an assertion.
 *
 * A filled day is neutral ink, not `--trace`. Colour is reserved for data, and
 * `--trace` means *weight* — spending it on attendance says a day you turned up
 * is the same kind of thing as the number you weighed.
 */
export function WeekStrip({
  days,
  logged,
  today,
}: {
  days: string[];
  logged: Set<string>;
  today: string;
}) {
  return (
    <ul className="mt-4 flex justify-between gap-1">
      {days.map((day) => {
        const has = logged.has(day);
        const isToday = day === today;
        const letter = new Intl.DateTimeFormat("en-US", {
          timeZone: "UTC",
          weekday: "narrow",
        }).format(dayKeyToDate(day));

        return (
          <li key={day} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[0.7rem] font-bold text-ink-faint">{letter}</span>
            <span
              title={day}
              className={`
                flex aspect-square w-full max-w-11 items-center justify-center
                rounded-2xl text-sm font-bold
                ${
                  has
                    ? "bg-ink text-ground"
                    : isToday
                      ? "bg-surface-sunk ring-2 ring-ink/25"
                      : "bg-surface-sunk text-ink-faint"
                }
              `}
            >
              {Number(day.slice(8))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
