"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";
import { completeSetupAction } from "@/app/actions/auth";
import { SecretField, TextField } from "@/components/pin-form";

const INITIAL: FormState = {};

export function SetupForm({ suggestion }: { suggestion: string }) {
  const [state, formAction, pending] = useActionState(
    completeSetupAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <TextField
        id="username"
        name="username"
        label="Username"
        hint="Lowercase letters, numbers and underscores. No spaces."
        defaultValue={suggestion}
        autoComplete="username"
        autoCapitalize="none"
        maxLength={20}
        autoFocus
      />

      <SecretField
        id="password"
        name="password"
        label="Choose a password"
        hint="At least 8 characters. Anything you like — no symbol required."
        autoComplete="new-password"
      />

      <SecretField
        id="confirm"
        name="confirm"
        label="Confirm password"
        autoComplete="new-password"
      />

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? "Working" : "Save and continue"}
      </button>

      {state.error && (
        <p role="alert" className="text-sm text-up">
          {state.error}
        </p>
      )}
    </form>
  );
}
