"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearChatAction,
  markChatReadAction,
  sendMessageAction,
} from "@/app/actions/chat";
import type { FriendResult } from "@/app/actions/friends";

const INITIAL: FriendResult = { ok: false };

/** Same reasoning as the friend card's quick notes: which sentences are on
 *  hand follows the friend's last move, and nothing renders the direction. */
const QUICK_DOWN = ["Proud of you", "Look at you go", "Keep it up 🔥"];
const QUICK_UP = ["Life has its ups and downs", "Keep going", "You've got this"];
const QUICK_STEADY = ["Proud of you", "Keep going", "Keep the streak going 🔥"];

function quickNotes(changeLbs: number | null): string[] {
  if (changeLbs === null || changeLbs === 0) return QUICK_STEADY;
  return changeLbs < 0 ? QUICK_DOWN : QUICK_UP;
}

export type ChatMessage = {
  id: string;
  body: string;
  mine: boolean;
  at: string;
};

export function Chat({
  friendId,
  friendName,
  friendshipId,
  changeLbs,
  hasUnread,
  messages,
}: {
  friendId: string;
  friendName: string;
  friendshipId: string;
  changeLbs: number | null;
  hasUnread: boolean;
  messages: ChatMessage[];
}) {
  const router = useRouter();
  const [state, sendAction, sending] = useActionState(sendMessageAction, INITIAL);
  const [body, setBody] = useState("");
  const endRef = useRef<HTMLLIElement>(null);

  // Opening the chat is reading it. Idempotent on the server, so firing on
  // every open (and after polls that brought something new) is safe.
  useEffect(() => {
    if (hasUnread) markChatReadAction(friendshipId);
  }, [hasUnread, friendshipId]);

  // No sockets on serverless: while this screen is visible, refresh the
  // server render every 12s. Push covers everything outside it.
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 12_000);
    return () => clearInterval(tick);
  }, [router]);

  // The newest message is the reason you are here.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Emptying the box is the receipt — same as the old note box.
  useEffect(() => {
    if (state.ok) setBody("");
  }, [state]);

  return (
    <>
      <ul className="mt-5 space-y-2 pb-36" aria-label={`Messages with ${friendName}`}>
        {messages.length === 0 && (
          <li className="list-none">
            <p className="text-sm text-ink-muted">
              No messages yet. Say hi — they get a notification.
            </p>
          </li>
        )}
        {messages.map((m) => (
          <li
            key={m.id}
            className={`max-w-[75%] rounded-2xl px-3 py-2 ${
              m.mine ? "ml-auto bg-ink text-ground" : "bg-surface-sunk"
            }`}
          >
            <p className="text-sm break-words">{m.body}</p>
            <p
              className={`tnum mt-0.5 text-[10px] ${
                m.mine ? "text-ground/60" : "text-ink-faint"
              }`}
            >
              {m.at}
            </p>
          </li>
        ))}
        <li ref={endRef} aria-hidden className="list-none" />
      </ul>

      <form
        action={sendAction}
        className="glass fixed inset-x-0 bottom-0 z-20 !rounded-none px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto max-w-2xl">
          <input type="hidden" name="friendId" value={friendId} />
          <div className="flex flex-wrap gap-2">
            {quickNotes(changeLbs).map((q) => (
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
              maxLength={500}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Message ${friendName}`}
              aria-label={`Message ${friendName}`}
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
          {state.error && (
            <p role="status" className="mt-2 text-xs text-up">
              {state.error}
            </p>
          )}
        </div>
      </form>
    </>
  );
}

export function ClearChat({
  friendId,
  friendName,
}: {
  friendId: string;
  friendName: string;
}) {
  const clearRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => clearRef.current?.showModal()}
        className="eyebrow shrink-0 transition-colors hover:!text-up"
      >
        Clear
      </button>

      <dialog ref={clearRef} className="confirm" aria-labelledby="clear-chat">
        <p id="clear-chat" className="font-bold">
          Clear this chat?
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Everything so far disappears from your view only — {friendName} keeps
          their copy. New messages still arrive here.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <form method="dialog" className="contents">
            <button type="submit" className="btn btn-quiet !py-2">
              Cancel
            </button>
          </form>
          <form
            action={async () => {
              await clearChatAction(friendId);
              clearRef.current?.close();
            }}
            className="contents"
          >
            <button type="submit" className="btn btn-primary !rounded-full !py-2">
              Clear
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
