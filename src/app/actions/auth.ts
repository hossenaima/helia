"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isValidTimezone } from "@/lib/dates";
import {
  endSession,
  hashPin,
  requireUser,
  signupAllowed,
  startSession,
  toHandle,
  verifyPin,
} from "@/lib/auth";
import {
  normaliseUsername,
  passwordProblem,
  usernameProblem,
} from "@/lib/credentials";

export type FormState = { error?: string };

const NAME_RULE = /^[\p{L}\p{N} '._-]{2,30}$/u;

/**
 * Whether this username is free.
 *
 * It checks `handle` as well as `username`, because sign-in still accepts
 * either while accounts predating usernames exist. Without this, Matthew could
 * take the username "jerry" while Jerry's legacy handle is also "jerry", and
 * one typed word would name two accounts. Handles containing a space can never
 * collide — a username may not contain one — so this only bites on the
 * single-word handles, which is exactly the set it catches.
 */
async function usernameTaken(username: string, exceptUserId?: string) {
  const clash = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { handle: username }],
      ...(exceptUserId ? { NOT: { id: exceptUserId } } : {}),
    },
    select: { id: true },
  });
  return clash !== null;
}

export async function signupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await signupAllowed())) {
    return { error: "Signup is closed. Ask for an account to be created." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const username = normaliseUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!NAME_RULE.test(name)) {
    return { error: "Use 2–30 letters or numbers for your name." };
  }
  const badUsername = usernameProblem(username);
  if (badUsername) return { error: badUsername };
  const badPassword = passwordProblem(password, username);
  if (badPassword) return { error: badPassword };
  if (password !== confirm) return { error: "The two passwords do not match." };

  const handle = toHandle(name);
  if (await prisma.user.findUnique({ where: { handle } })) {
    return { error: "That name is taken. Pick another." };
  }
  if (await usernameTaken(username)) {
    return { error: "That username is taken. Pick another." };
  }

  const { hash, salt } = await hashPin(password);

  // The checks above are not a guarantee — two people submitting the same name
  // at once both pass them, and the unique index decides. Catching that here is
  // the difference between the loser seeing "pick another" and seeing a
  // server error.
  let user;
  try {
    user = await prisma.user.create({
      data: {
        name,
        handle,
        username,
        pinHash: hash,
        pinSalt: salt,
        // Chose both up front, so there is nothing for /setup to ask.
        setupComplete: true,
        ...timezoneFrom(formData),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "That name or username is taken. Pick another." };
    }
    throw error;
  }

  await startSession(user.id);
  redirect("/");
}

/**
 * The one-time upgrade for an account that predates usernames and password
 * rules: choose both, once, after signing in with the old PIN.
 *
 * The old secret is only replaced at the end of this, which is what makes the
 * whole migration incapable of locking anybody out — up to this moment their
 * PIN still works, and if they never come here it still works tomorrow.
 */
export async function completeSetupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (user.setupComplete) redirect("/");

  const username = normaliseUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const badUsername = usernameProblem(username);
  if (badUsername) return { error: badUsername };
  const badPassword = passwordProblem(password, username);
  if (badPassword) return { error: badPassword };
  if (password !== confirm) return { error: "The two passwords do not match." };
  if (await usernameTaken(username, user.id)) {
    return { error: "That username is taken. Pick another." };
  }

  const { hash, salt } = await hashPin(password);
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { username, pinHash: hash, pinSalt: salt, setupComplete: true },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "That username is taken. Pick another." };
    }
    throw error;
  }

  redirect("/");
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const typed = String(formData.get("name") ?? "").trim();
  const secret = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  // Username first, then the legacy handle. Accounts that have been through
  // /setup are found by the former; those that have not are still found by the
  // name they have always typed. `usernameTaken` guarantees at most one match
  // across the two, so the order here decides nothing but which query runs.
  const user =
    (await prisma.user.findUnique({
      where: { username: normaliseUsername(typed) },
    })) ??
    (await prisma.user.findUnique({ where: { handle: toHandle(typed) } }));

  // One message for both a missing account and a wrong secret, so this page
  // cannot be used to find out who has an account here.
  const rejected = { error: "That username and password do not match an account." };
  if (!user) return rejected;
  if (!(await verifyPin(secret, user.pinHash, user.pinSalt))) return rejected;

  // Refreshed on every sign-in, so the day boundary follows you when you travel.
  const tz = timezoneFrom(formData);
  if (tz.timezone && tz.timezone !== user.timezone) {
    await prisma.user.update({ where: { id: user.id }, data: tz });
  }

  await startSession(user.id);
  // Only same-site relative paths, so `?next=` cannot bounce elsewhere.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

/** Prisma's code for a unique-constraint conflict. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/** The browser reports its own zone; anything unresolvable is ignored. */
function timezoneFrom(formData: FormData): { timezone?: string } {
  const tz = String(formData.get("timezone") ?? "").trim();
  return tz && isValidTimezone(tz) ? { timezone: tz } : {};
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
