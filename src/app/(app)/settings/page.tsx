import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getEstimator } from "@/lib/ai/estimator";
import { fromLbs } from "@/lib/units";
import { PageTitle } from "@/components/page-title";
import {
  GoalForm,
  PasswordChangeForm,
  EmailForm,
  DigestForm,
} from "@/components/settings-forms";
import { DeleteAccount } from "@/components/delete-account";
import { NotificationSettings } from "@/components/notification-settings";
import { AvatarEditor } from "@/components/avatar-editor";
import { logoutAction } from "@/app/actions/auth";
import { prisma } from "@/lib/db";

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { units } = user;
  const aiEnabled = getEstimator().available;
  const deviceCount = await prisma.pushSubscription.count({
    where: { userId: user.id },
  });

  return (
    <>
      <PageTitle>Settings</PageTitle>
      <section className="mt-6">
        <h2 className="eyebrow">Goal &amp; targets</h2>
        <GoalForm
          units={units}
          goalWeight={display(user.goalWeightLbs, units)}
          startWeight={display(user.startWeightLbs, units)}
          heightInches={user.heightInches}
          calorieTarget={user.calorieTarget}
          proteinTargetG={user.proteinTargetG}
          fiberTargetG={user.fiberTargetG}
        />
      </section>

      <section className="mt-10">
        <h2 className="eyebrow">Calorie estimation</h2>
        <div className="mt-4 rounded-xl border border-rule bg-surface p-5">
          <p className="text-sm">
            {aiEnabled ? "On." : "Off."} Estimation runs through Gemini using the
            key in your server environment.
          </p>
          {!aiEnabled && (
            <p className="mt-2 text-sm text-ink-muted">
              Set <code className="tnum text-xs">GEMINI_API_KEY</code> where
              the app is hosted, then restart it.
            </p>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="eyebrow">Notifications</h2>
        <NotificationSettings
          notifyWeighIn={user.notifyWeighIn}
          notifyFriends={user.notifyFriends}
          reminderHour={user.reminderHour}
          deviceCount={deviceCount}
        />
      </section>

      <section className="mt-10">
        <h2 className="eyebrow">Announcements</h2>
        <EmailForm email={user.email} />
        <DigestForm enabled={user.notifyDigest} hasEmail={user.email !== null} />
      </section>

      <section className="mt-10">
        <h2 className="eyebrow">Password</h2>
        <PasswordChangeForm />
      </section>

      <section className="mt-10">
        <h2 className="eyebrow">Profile picture</h2>
        <AvatarEditor current={user.avatar} name={user.name} />
      </section>

      <section className="mt-10">
        <h2 className="eyebrow">Account</h2>
        <div className="card mt-4 flex items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-sm font-bold">Signed in as {user.name}</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {user.username
                ? `You sign in as ${user.username}.`
                : "You will need your password to get back in."}
            </p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-quiet shrink-0 !py-2">
              Sign out
            </button>
          </form>
        </div>
        <DeleteAccount name={user.name} />
      </section>

      <section className="mt-10">
        <h2 className="eyebrow">Data</h2>
        <div className="mt-4 rounded-xl border border-rule bg-surface p-5">
          <Link href="/calendar" className="text-sm underline underline-offset-2">
            Open the calendar
          </Link>
          <p className="mt-1 text-sm text-ink-muted">
            Log or correct any day, and import an Apple Health export.
          </p>
        </div>
      </section>
    </>
  );
}

function display(lbs: number | null, units: Parameters<typeof fromLbs>[1]) {
  return lbs === null ? null : Math.round(fromLbs(lbs, units) * 10) / 10;
}
