"use client";

import { useActionState, useRef } from "react";
import { deleteAccountAction, type FormState } from "@/app/actions/auth";

const INITIAL: FormState = {};

/**
 * Deleting the account, behind a native `<dialog>` and a password.
 *
 * Same pattern as removing a friend: `showModal()` brings the top layer — above
 * the glass panels and the fixed tab bar, which a hand-rolled overlay would end
 * up underneath — plus focus trapping, Escape and background inertness, none of
 * which is worth reimplementing.
 *
 * The dialog stays open on a wrong password because the form posts to a server
 * action rather than closing itself with `method="dialog"`; only Cancel does
 * that. Otherwise a typo would dismiss the whole thing with nothing said.
 */
export function DeleteAccount({ name }: { name: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(
    deleteAccountAction,
    INITIAL,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="eyebrow mt-4 transition-colors hover:!text-up"
      >
        Delete account
      </button>

      <dialog ref={ref} className="confirm" aria-labelledby="delete-account">
        <p id="delete-account" className="font-bold">
          Delete {name}&rsquo;s account?
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Every weigh-in, meal, friendship and note goes with it, for good.
          There is no backup and nobody can undo this — not even from the
          database.
        </p>

        <form action={formAction} className="mt-4">
          <label htmlFor="delete-password" className="eyebrow block">
            Your password
          </label>
          <input
            id="delete-password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoCapitalize="none"
            maxLength={200}
            className="
              mt-2 w-full border-b border-rule bg-transparent pb-1 text-lg
              focus:border-trace focus:outline-none
            "
          />

          {state.error && (
            <p role="alert" className="mt-3 text-sm text-up">
              {state.error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            {/* Not the `<form method="dialog">` used elsewhere: that would be a
                form inside a form, which is invalid and does not parse. A
                plain button calling close() is the same effect. */}
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="btn btn-quiet !py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary !rounded-full !py-2"
            >
              {pending ? "Deleting" : "Delete for good"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
