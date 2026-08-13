import { cache } from "react";
import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  createSessionToken,
  userIdFromToken,
} from "@/lib/session";
import type { Units } from "@/lib/units";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export type SessionUser = {
  id: string;
  name: string;
  handle: string;
  username: string | null;
  email: string | null;
  notifyDigest: boolean;
  setupComplete: boolean;
  goalWeightLbs: number | null;
  startWeightLbs: number | null;
  heightInches: number | null;
  units: Units;
  timezone: string;
  notifyWeighIn: boolean;
  notifyFriends: boolean;
  reminderHour: number;
  milestoneLbs: number;
  shareWeight: boolean;
  calorieTarget: number | null;
  proteinTargetG: number | null;
  fiberTargetG: number | null;
  avatar: string | null;
};

// --- PIN hashing -----------------------------------------------------------

export async function hashPin(pin: string, salt?: string) {
  const useSalt = salt ?? randomBytes(16).toString("hex");
  const derived = await scryptAsync(pin, useSalt, 64);
  return { hash: derived.toString("hex"), salt: useSalt };
}

export async function verifyPin(pin: string, hash: string, salt: string) {
  const { hash: candidate } = await hashPin(pin, salt);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The lookup key for a name. "Aima ", "aima" and "Aima  Hossen" all have to
 * land on the same account as "Aima Hossen".
 *
 * Trimming and lowercasing alone was not enough: a doubled inner space made a
 * second, separate account that looked identical in every list, and a friend
 * request typed with single spaces could never find it. NFKC additionally
 * folds full-width and other compatibility forms onto their plain equivalents.
 */
export function toHandle(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// --- Session cookie --------------------------------------------------------

export async function startSession(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * The signed-in user, or null. The account is re-read from the database on
 * every call rather than trusted from the cookie, so a deleted account cannot
 * keep acting on a still-valid token.
 *
 * Deduped per request: the layout and the page inside it both ask who is
 * signed in, and without this that is two identical round trips on the
 * critical path of every navigation.
 */
export const currentUser = cache(async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const userId = userIdFromToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    username: user.username,
    email: user.email,
    notifyDigest: user.notifyDigest,
    setupComplete: user.setupComplete,
    goalWeightLbs: user.goalWeightLbs,
    startWeightLbs: user.startWeightLbs,
    heightInches: user.heightInches,
    units: user.units === "kg" ? "kg" : "lb",
    timezone: user.timezone,
    notifyWeighIn: user.notifyWeighIn,
    notifyFriends: user.notifyFriends,
    reminderHour: user.reminderHour,
    milestoneLbs: user.milestoneLbs,
    shareWeight: user.shareWeight,
    calorieTarget: user.calorieTarget,
    proteinTargetG: user.proteinTargetG,
    fiberTargetG: user.fiberTargetG,
    avatar: user.avatar,
  };
});

/**
 * Guard for every server action and protected page. Proxy does an optimistic
 * cookie check, but server actions are reachable by direct POST, so the real
 * check has to live next to the data — and it returns the user, so callers are
 * pushed into scoping their queries rather than merely asserting auth.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

/** True when at least one account exists — controls the first-run experience. */
export async function hasAnyUser(): Promise<boolean> {
  return (await prisma.user.count()) > 0;
}

/**
 * Signup is open by default so a second person can join, but setting
 * ALLOW_SIGNUP=false closes it once everyone who needs an account has one.
 * The first account is always allowed, otherwise the app could never be set up.
 */
export async function signupAllowed(): Promise<boolean> {
  if (process.env.ALLOW_SIGNUP === "false") {
    return !(await hasAnyUser());
  }
  return true;
}
