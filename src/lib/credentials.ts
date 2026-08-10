/**
 * Rules for the two things a person chooses about their account.
 *
 * Deliberately outside `auth.ts`: that module imports `server-only`, and the
 * signup form wants to say what is wrong before spending a round trip on it.
 * Nothing here touches the database or the session.
 */

/**
 * Lowercase, no spaces. This is what someone types to sign in, and the shape
 * an App Store build would put in a profile URL. It starts alphanumeric so it
 * can never be read as a flag or an option by anything downstream.
 */
const USERNAME_RULE = /^[a-z0-9][a-z0-9_]{2,19}$/;

/**
 * Names the app itself answers to, or that could be worn to impersonate it.
 * The whole social layer here is people sending each other short notes, so an
 * account called "helia" or "support" is a phishing surface, not a nuisance.
 */
const RESERVED = new Set([
  "admin", "administrator", "root", "system", "staff", "team", "mod",
  "moderator", "support", "help", "helia", "official", "security", "billing",
  "api", "login", "logout", "signup", "setup", "settings", "account",
  "friends", "meals", "calendar", "weight", "me", "you", "null", "undefined",
]);

/**
 * Passwords already on every attacker's first guess. A real deployment should
 * check against a breach corpus rather than a list this short.
 *
 * ponytail: 24-entry inline list, swap for the haveibeenpwned range API
 * (k-anonymity, no password leaves the server) if this app ever opens to
 * people who did not get an invite.
 */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789",
  "1234567890", "qwertyuiop", "qwerty123", "letmein1", "iloveyou",
  "sunshine1", "princess1", "football1", "baseball1", "welcome1",
  "abc12345", "monkey123", "dragon123", "trustno1", "passw0rd",
  "admin123", "iloveyou1", "starwars1", "michael1",
]);

/** Folds a typed username to its stored form. */
export function normaliseUsername(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

/** The reason this username cannot be used, or null when it can. */
export function usernameProblem(raw: string): string | null {
  const username = normaliseUsername(raw);
  if (username === "") return "Pick a username.";
  if (/\s/.test(username)) return "Usernames cannot contain spaces.";
  if (!USERNAME_RULE.test(username)) {
    return "3–20 characters: lowercase letters, numbers and underscores, starting with a letter or number.";
  }
  if (RESERVED.has(username)) return "That username is reserved. Pick another.";
  return null;
}

/**
 * Length is the requirement here, not composition.
 *
 * NIST SP 800-63B dropped the mixed-case-and-a-symbol advice: those rules
 * reliably produce "Password1!" and buy very little, while the things that do
 * help are a floor on length and a check against passwords attackers already
 * hold. Both of those are below. Nothing is rejected for lacking a symbol.
 *
 * The username is passed in because reusing it as the password is the one
 * composition mistake worth naming.
 */
export function passwordProblem(password: string, username: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  // scrypt cost is paid on the server for whatever arrives; a bounded input
  // keeps a long paste from becoming a way to tie up a request.
  if (password.length > 200) return "That password is too long.";
  const folded = password.toLowerCase();
  if (COMMON_PASSWORDS.has(folded)) {
    return "That password is one of the most commonly used. Pick another.";
  }
  if (username && folded.includes(normaliseUsername(username))) {
    return "Your password cannot contain your username.";
  }
  if (new Set(password).size === 1) {
    return "That password is a single repeated character.";
  }
  return null;
}
