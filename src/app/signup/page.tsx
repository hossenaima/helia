import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAnyUser, signupAllowed } from "@/lib/auth";
import { signupAction } from "@/app/actions/auth";
import { PinForm } from "@/components/pin-form";
import { AuthBackdrop } from "@/components/auth-backdrop";
import { AuthIntro } from "@/components/auth-intro";

// Auth state changes per request; nothing here may be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (!(await signupAllowed())) redirect("/login");
  const returning = await hasAnyUser();

  return (
    <main className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <AuthBackdrop />
      <div className="settle">
        <p className="eyebrow">{returning ? "Join Helia" : "First run"}</p>
        <h1 className="mt-1 font-cond text-3xl font-bold tracking-tight">
          A quiet daily health log
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Morning weigh-ins and meals, in about a minute a day.
        </p>

        <AuthIntro />

        <p className="mt-5 text-sm text-ink-muted">
          Your username is how you sign in, and your password is the only thing
          standing between your log and anyone who finds the URL — so make it
          one you do not use elsewhere. Each account is separate; nobody else
          here can see your weigh-ins or meals.
        </p>

        <PinForm action={signupAction} mode="signup" />

        {returning && (
          <p className="mt-6 text-sm text-ink-muted">
            Already have an account?{" "}
            <Link href="/login" className="underline underline-offset-2">
              Sign in
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}
