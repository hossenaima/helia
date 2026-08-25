"use client";

import { useEffect, useRef } from "react";

/* Same hues as the rainbow ring and headline, so one celebration, one palette. */
const COLORS = ["#c95f52", "#d9a514", "#3a9d5d", "#4e86e0", "#ae5fb0"];

/**
 * One burst of confetti over whatever positioned card contains it, then gone.
 *
 * Hand-rolled on a canvas rather than a library: the whole requirement is
 * seventy rectangles falling for two seconds, once. Skipped entirely under
 * reduced motion — the milestone card still says everything the confetti says.
 */
export function ConfettiBurst() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const pieces = Array.from({ length: 70 }, (_, i) => ({
      x: Math.random() * width,
      y: -10 - Math.random() * height * 0.5,
      vx: (Math.random() - 0.5) * 50,
      vy: 50 + Math.random() * 80,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 10,
      w: 5 + Math.random() * 4,
      h: 3 + Math.random() * 3,
      color: COLORS[i % COLORS.length],
    }));

    const DURATION = 2.2; // seconds; pieces fade over the last 0.6
    let start: number | null = null;
    let raf = 0;

    const tick = (now: number) => {
      start ??= now;
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, width, height);
      if (t >= DURATION) return;

      ctx.globalAlpha = Math.min(1, (DURATION - t) / 0.6);
      for (const p of pieces) {
        ctx.save();
        ctx.translate(p.x + p.vx * t, p.y + p.vy * t + 60 * t * t);
        ctx.rotate(p.angle + p.spin * t);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
