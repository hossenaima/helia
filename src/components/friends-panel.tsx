"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  requestFriendAction,
  respondToRequestAction,
  removeFriendAction,
  sendEncouragementAction,
  setMealSharingAction,
  type FriendResult,
} from "@/app/actions/friends";
import type { FriendSummary } from "@/lib/friends";
import { FriendWeekChart } from "@/components/friend-week-chart";
import { Toggle } from "@/components/sharing-controls";
import { formatDayShort } from "@/lib/dates";
import { formatDelta, fromLbs, type Units } from "@/lib/units";

const INITIAL: FriendResult = { ok: false };

/**
 * The quick notes follow the friend's last move, because the same sentence is
 * congratulation on one morning and salt in the wound on another. A tester
 * asked for this: "Nice work today" went because nobody talks like that, and
 * offering it to someone whose weight went up made it worse.
 *
 * This does not contradict "a friend's gain is not scored" — nothing here
 * renders the direction or judges it. It only decides which three sentences
 * are on hand, and the box stays free text either way.
 */
const QUICK_DOWN = ["Proud of you", "Look at you go", "Keep it up 🔥"];
const QUICK_UP = ["Life has its ups and downs", "Keep going", "You've got this"];
/** No shared weight, or no earlier reading to compare against — say something
 *  that is true whichever way the morning went. */
const QUICK_STEADY = ["Proud of you", "Keep going", "Keep the streak going 🔥"];

function quickNotes(changeLbs: number | null): string[] {
  if (changeLbs === null || changeLbs === 0) return QUICK_STEADY;
  return changeLbs < 0 ? QUICK_DOWN : QUICK_UP;
}

export function FriendsPanel({
  friends,
  incoming,
  outgoing,
  units,
}: {
  friends: FriendSummary[];
  incoming: Array<{ id: string; name: string }>;
  outgoing: Array<{ id: string; name: string }>;
  units: Units;
}) {
  const [state, addAction, adding] = useActionState(requestFriendAction, INITIAL);

  return (
    <>
      {incoming.length > 0 && (
        <section className="mt-5" aria-label="Requests">
          <h2 className="eyebrow">Wants to be friends</h2>
          <ul className="mt-3 space-y-2">
            {incoming.map((r) => (
              <li key={r.id} className="card flex items-center gap-3 p-4">
                <span className="min-w-0 flex-1 truncate font-bold">
                  {r.name}
                </span>
                <form action={respondToRequestAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="accept" value="0" />
                  <button
                    type="submit"
                    className="btn !px-3 !py-1.5 text-ink-muted hover:text-ink"
                  >
                    Ignore
                  </button>
                </form>
                <form action={respondToRequestAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="accept" value="1" />
                  <button
                    type="submit"
                    className="btn btn-primary !rounded-full !py-1.5"
                  >
                    Accept
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6" aria-label="Friends">
        {/* No heading on an empty list — the page title already says Friends,
            and a second one above one sentence is just a louder nothing. */}
        {friends.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No friends yet. Add someone by the name they signed up with.
          </p>
        ) : (
          <ul className="space-y-3">
            {friends.map((f, i) => (
              <FriendCard key={f.id} friend={f} units={units} index={i} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-label="Add a friend">
        <h2 className="eyebrow">Add someone</h2>
        <form action={addAction} className="card mt-3 p-5">
          <label htmlFor="friend-name" className="eyebrow block">
            Their name
          </label>
          <input
            id="friend-name"
            name="name"
            type="text"
            autoComplete="off"
            placeholder="exactly as they signed up"
            className="mt-2 w-full border-b border-rule bg-transparent pb-1 text-lg placeholder:text-ink-faint focus:border-trace focus:outline-none"
          />
          <button
            type="submit"
            disabled={adding}
            className="btn btn-primary !rounded-full mt-5 w-full"
          >
            {adding ? "Sending" : "Send invite"}
          </button>
          <p
            role="status"
            className={`mt-3 text-sm ${state.error ? "text-up" : "text-ink-muted"}`}
          >
            {state.error ?? state.message ?? ""}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Once they accept, they see your weight if you have that switched on
            below. Your food stays private until you turn it on for them.
          </p>
        </form>

        {outgoing.length > 0 && (
          <p className="mt-3 text-xs text-ink-muted">
            Waiting on: {outgoing.map((o) => o.name).join(", ")}
          </p>
        )}
      </section>
    </>
  );
}

function FriendCard({
  friend,
  units,
  index,
}: {
  friend: FriendSummary;
  units: Units;
  index: number;
}) {
  const [state, sendAction, sending] = useActionState(
    sendEncouragementAction,
    INITIAL,
  );
  const [body, setBody] = useState("");
  // Optimistic, like the settings toggles: a tap answers immediately and the
  // server is the record rather than the render.
  const [shareFood, setShareFood] = useState(friend.iShareMeals);
  const [, startSharing] = useTransition();
  const removeRef = useRef<HTMLDialogElement>(null);

  // Emptying the box is the receipt. Leaving the text sitting there reads as
  // "nothing happened", and the obvious response to that is to press Send
  // again. `useActionState` hands back a fresh object per submission, so this
  // fires once per send rather than only when the message changes.
  useEffect(() => {
    if (state.ok) setBody("");
  }, [state]);

  return (
    <li
      className="settle card p-4"
      // Capped, or the tenth row would still be waiting after half a second.
      style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
    >
      {/* A native disclosure: the header row is the summary, the week chart is
          the content. No state, no toggle handler, and the keyboard and screen
          reader behaviour comes free. Nothing inside the summary is itself
          interactive, which is what makes that legal. */}
      <details className="group">
        <summary
          className="
            -m-1 flex cursor-pointer list-none items-baseline justify-between
            gap-3 rounded-lg p-1
            [&::-webkit-details-marker]:hidden
          "
        >
          <p className="min-w-0 flex-1 truncate font-bold">{friend.name}</p>
          <span className="tnum shrink-0 text-sm">
            {friend.latestLbs !== null
              ? `${fromLbs(friend.latestLbs, units).toFixed(1)} ${units}`
              : friend.shares.weight
                ? "—"
                : ""}
          </span>
          {friend.shares.weight && (
            <span
              aria-hidden
              className="shrink-0 text-ink-faint transition-transform group-open:rotate-90"
            >
              ›
            </span>
          )}
        </summary>
        {friend.shares.weight ? (
          <FriendWeekChart week={friend.week} units={units} />
        ) : (
          <p className="mt-3 text-xs text-ink-muted">
            {friend.name} keeps their weight private.
          </p>
        )}
      </details>

      <p className="mt-1 text-xs text-ink-muted">
        {!friend.shares.weight ? (
          friend.loggedToday ? "Logged today" : "Weight is private"
        ) : friend.latestDate === null ? (
          "Has not logged a weigh-in yet"
        ) : (
          <>
            {friend.loggedToday
              ? "Logged today"
              : `Last logged ${formatDayShort(friend.latestDate)}`}
            {friend.changeLbs !== null && (
              <>
                {" · "}
                {/* A loss is worth colouring; a gain is not scored. Rust and an
                    ↑ on the one screen built for encouragement told a friend
                    off for their morning. The arrow still says which way. */}
                <span className={friend.changeLbs < 0 ? "text-down" : ""}>
                  {friend.changeLbs < 0 ? "↓" : "↑"}{" "}
                  {formatDelta(friend.changeLbs, units)}
                </span>
              </>
            )}
            {friend.streak > 0 && <> · 🔥 {friend.streak}</>}
          </>
        )}
        {!friend.shares.weight && friend.streak > 0 && (
          <> · 🔥 {friend.streak}</>
        )}
      </p>

      {friend.shares.meals && (
        <div className="mt-3 rounded-xl bg-surface-sunk px-3 py-2">
          <p className="tnum flex items-baseline justify-between gap-3 text-xs font-bold">
            <span>Today</span>
            <span>
              {friend.caloriesToday === null
                ? "—"
                : `${friend.caloriesToday.toLocaleString()} kcal`}
            </span>
          </p>
          {friend.mealsToday.length === 0 ? (
            <p className="mt-1 text-xs text-ink-muted">Nothing logged yet.</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {friend.mealsToday.map((m, i) => (
                <li
                  key={`${m.name}-${i}`}
                  className="flex items-baseline justify-between gap-3 text-xs text-ink-muted"
                >
                  <span className="min-w-0 truncate">{m.name}</span>
                  <span className="tnum shrink-0">
                    {m.calories.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form action={sendAction} className="mt-3">
        <input type="hidden" name="toId" value={friend.id} />
        <div className="flex flex-wrap gap-2">
          {quickNotes(friend.changeLbs).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setBody(q)}
              className="chip btn-soft"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            name="body"
            type="text"
            maxLength={200}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Send ${friend.name} a note`}
            aria-label={`Encouragement for ${friend.name}`}
            className="min-w-0 flex-1 rounded-xl bg-surface-sunk px-3 py-2 text-sm placeholder:text-ink-faint focus:outline-2 focus:outline-trace"
          />
          <button
            type="submit"
            disabled={sending || body.trim() === ""}
            className="btn btn-primary !rounded-full shrink-0 !py-2"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
        {(state.error || state.message) && (
          <p
            role="status"
            className={`mt-2 text-xs ${state.error ? "text-up" : "text-ink-muted"}`}
          >
            {state.error ?? state.message}
          </p>
        )}
      </form>

      {/* Per friend, not per account: this is the one thing people wanted to
          answer differently for different people. It sits on their card so the
          person it applies to is on screen while you decide. */}
      <div className="mt-3 border-t border-rule pt-1">
        <Toggle
          label="Let them see my food"
          hint={`Today's total and each meal, for ${friend.name} only.`}
          checked={shareFood}
          onChange={(v) => {
            setShareFood(v);
            startSharing(async () => {
              await setMealSharingAction({ friendId: friend.id, share: v });
            });
          }}
        />
      </div>

      {/* Removing is destructive and one tap away from the note box, so it asks
          first. A native <dialog> — showModal() brings the top layer, focus
          trapping, Escape and inertness with it, none of which is worth
          reimplementing. */}
      <button
        type="button"
        onClick={() => removeRef.current?.showModal()}
        className="eyebrow mt-3 transition-colors hover:!text-up"
      >
        Remove friend
      </button>

      <dialog ref={removeRef} className="confirm" aria-labelledby={`rm-${friend.id}`}>
        <p id={`rm-${friend.id}`} className="font-bold">
          Remove {friend.name}?
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          You will stop seeing each other&rsquo;s weigh-ins and food, and what
          you had chosen to share with them is forgotten. Either of you can send
          a new invite later.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          {/* method="dialog" closes without submitting anything. */}
          <form method="dialog" className="contents">
            <button type="submit" className="btn btn-quiet !py-2">
              Cancel
            </button>
          </form>
          <form action={removeFriendAction} className="contents">
            <input type="hidden" name="otherId" value={friend.id} />
            <button type="submit" className="btn btn-primary !rounded-full !py-2">
              Remove
            </button>
          </form>
        </div>
      </dialog>
    </li>
  );
}
