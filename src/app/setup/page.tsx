import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { SetupForm } from "@/components/setup-form";

// Reads the session; nothing here may be prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * The one-time upgrade for accounts that predate usernames and passwords.
 *
 * It lives outside the `(app)` group deliberately: that layout is what
 * redirects here, so a page inside it would redirect to itself forever. There
 * is no tab bar, because the one thing to do here is finish.
 */
export default async function SetupPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.setupComplete) redirect("/");

  // Their existing handle with the spaces taken out — usually right, always
  // editable. Offering it beats an empty box that asks people to invent
  // something before they can get to their weigh-in.
  const suggestion = user.handle.replace(/[^a-z0-9_]/g, "").slice(0, 20);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <div className="settle">
        <p className="eyebrow">One thing first</p>
        <h1 className="mt-1 font-cond text-3xl font-bold tracking-tight">
          Pick a username and a password
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Helia started with names and PINs. Names with spaces in them will not
          survive an App Store build, and a four-digit PIN is not much of a lock
          on a health log. Choosing these now means nothing changes for you
          later.
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          Your display name stays <strong className="text-ink">{user.name}</strong> —
          this only changes what you type to sign in.
        </p>

        <SetupForm suggestion={suggestion} />
      </div>
    </main>
  );
}
