"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { ChartPoint } from "@/components/weight-chart";
import type { Units } from "@/lib/units";

/**
 * The chart, fetched only once it is nearly on screen.
 *
 * Recharts is a **368 kB chunk — more than the entire rest of the app** — and
 * it lands on the Weight tab, which is the one opened at 7am every morning to
 * read one number and type another. Both of those happen above the fold; the
 * chart is roughly 400px below it. Measured, the tab took 1.75s to
 * DOMContentLoaded against 0.4–0.7s for every other route, and the whole
 * difference was this.
 *
 * `ssr: false` costs nothing here: `ResponsiveContainer` measures its parent
 * before drawing, so the server-rendered markup was empty anyway.
 *
 * **No `rootMargin`.** It was 300px at first, to start the download just before
 * the chart came into view — but the chart's top sits about 960px down a
 * 844px-tall phone screen, so a 300px margin reaches it while the page is still
 * at rest and nothing was deferred at all. Measured: the chart drew before a
 * single scroll. Loading on actual intersection is what keeps the 364 kB off a
 * morning where somebody reads the ring, types a number and closes the app.
 */
const WeightChart = dynamic(
  () => import("@/components/weight-chart").then((m) => m.WeightChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

export function LazyWeightChart(props: {
  points: ChartPoint[];
  goalLbs: number | null;
  units: Units;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = anchor.current;
    if (!el || visible) return;

    // Two triggers, because the observer alone strands people. It reports
    // intersection *state* when it samples, so a viewport that jumps straight
    // past the chart — scroll restoration, a jump link, an instant scrollTo —
    // goes from below it to above it without ever sampling an intersecting
    // frame, and the skeleton then stays forever. Found by scrolling to the
    // bottom in a test and watching the chart never arrive.
    //
    // So: the observer covers "it is on screen", including the case where the
    // page is short enough that it always was. Any scroll at all covers the
    // rest — on this tab everything below the fold is the chart, so somebody
    // scrolling is somebody heading for it.
    //
    // No feature check: `IntersectionObserver` predates `dialog.showModal` and
    // `createImageBitmap`, both of which this app already requires.
    const show = () => setVisible(true);
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) show();
    });
    observer.observe(el);
    window.addEventListener("scroll", show, { passive: true, once: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", show);
    };
  }, [visible]);

  return (
    <div ref={anchor}>{visible ? <WeightChart {...props} /> : <ChartSkeleton />}</div>
  );
}

/** Same height as the real thing, so nothing jumps when it arrives. */
function ChartSkeleton() {
  return (
    <div className="mt-3" aria-hidden>
      <div className="h-4 w-40 rounded bg-surface-sunk" />
      <div className="mt-2 h-[230px] rounded-lg bg-surface-sunk" />
    </div>
  );
}
