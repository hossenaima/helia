import { ViewTransition } from "react";

/**
 * Crossfades the content of one tab into the next.
 *
 * A template remounts on every navigation where a layout does not, which is
 * exactly what gives React two states to transition between. The header and
 * the tab bar stay in the layout above this and never unmount, so only the
 * content below them changes — which is the whole point. Five peer tabs have
 * no forward or back, so a directional slide would be saying something untrue;
 * a crossfade says "same place, different content".
 *
 * Both sides are named, deliberately: an earlier cut animated only `enter`
 * (exit fell under default="none"), so the old tab vanished in one frame and
 * the switch read as a flash rather than a transition. The classes are
 * defined in globals.css — a quiet fade, the new content drifting up a few
 * pixels. Reduced-motion zeroes them there with the other VT rules.
 */
export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ViewTransition enter="tab-enter" exit="tab-exit" share="auto" default="none">
      {children}
    </ViewTransition>
  );
}
