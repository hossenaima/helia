"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions/auth";

const INITIAL: FormState = {};

export function PinForm({
  action,
  mode,
  next,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  mode: "login" | "signup";
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const isSignup = mode === "signup";
  const tzRef = useRef<HTMLInputElement>(null);

  // Filled after mount: the server cannot know the visitor's zone.
  useEffect(() => {
    if (tzRef.current) {
      tzRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }, []);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      <input ref={tzRef} type="hidden" name="timezone" />

      {isSignup && (
        <TextField
          // Keyed on the value React is restoring to. The form reset that
          // follows an action reverts each input to its `defaultValue`, and
          // remounting is what guarantees the new one is in place first.
          key={`name-${state.values?.name ?? ""}`}
          id="name"
          name="name"
          label="Display name"
          hint="What friends see on your card. Spaces are fine here."
          defaultValue={state.values?.name ?? ""}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={30}
          autoFocus
        />
      )}

      <TextField
        key={`id-${state.values?.username ?? state.values?.name ?? ""}`}
        defaultValue={
          (isSignup ? state.values?.username : state.values?.name) ?? ""
        }
        id="name-or-username"
        // Still `name`: sign-in accepts a username or the name an older
        // account has always typed, and the action decides which it is.
        name={isSignup ? "username" : "name"}
        label="Username"
        hint={
          isSignup
            ? "Lowercase letters, numbers and underscores. No spaces."
            : // Accounts made before usernames existed still sign in with the
              // name they always typed, and would otherwise read this label as
              // asking for something they have never been given.
              "Or the name you signed up with."
        }
        autoComplete="username"
        autoCapitalize="none"
        maxLength={isSignup ? 20 : 30}
        autoFocus={!isSignup}
      />

      <SecretField
        id="password"
        name="password"
        label={isSignup ? "Choose a password" : "Password"}
        hint={isSignup ? "At least 8 characters." : undefined}
        autoComplete={isSignup ? "new-password" : "current-password"}
      />

      {isSignup && (
        <SecretField
          id="confirm"
          name="confirm"
          label="Confirm password"
          autoComplete="new-password"
        />
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? "Working" : isSignup ? "Create account" : "Unlock"}
      </button>

      {state.error && (
        <p role="alert" className="text-sm text-up">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function TextField({
  id,
  name,
  label,
  hint,
  ...input
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow block">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="
          mt-2 w-full border-b-2 border-rule bg-transparent pb-1 text-2xl
          focus:border-trace focus:outline-none
        "
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * A password field, not the old PIN field: no `inputMode="numeric"` and no
 * `pattern="\d*"`, both of which would now stop people typing the letters the
 * rules ask for — and on a phone the numeric keypad alone would have.
 */
export function SecretField({
  id,
  name,
  label,
  hint,
  autoComplete,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow block">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="password"
        autoComplete={autoComplete}
        autoCapitalize="none"
        maxLength={200}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="
          mt-2 w-full border-b-2 border-rule bg-transparent pb-1 text-2xl
          focus:border-trace focus:outline-none
        "
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
