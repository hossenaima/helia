import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // React's <ViewTransition> (the tab crossfade) needs no flag since Next
    // 16.3 — it works in the App Router with no configuration.

    // Let a tab you have already opened come back from the client cache
    // instead of being refetched. Switching tabs was ~355ms of round trip
    // every time, and the morning routine is Weight → Meals → Weight.
    //
    // 30 seconds, not longer: this is a log whose numbers are the point, and
    // "stale numbers are worse than none" is why the service worker caches
    // nothing. Your own writes are unaffected — every action that changes data
    // calls revalidatePath, which drops the client cache for that path — so
    // the only thing that can be up to 30s old is somebody else's weigh-in on
    // the Friends tab.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
