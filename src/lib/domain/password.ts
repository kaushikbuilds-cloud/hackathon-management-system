import { randomInt } from "node:crypto";

// Unambiguous characters only (no 0/O, 1/l/I) so printed/read-out temporary
// passwords are easy to type.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%*?";

/** Cryptographically random temporary password with all character classes. */
export function generateTemporaryPassword(length = 14): string {
  if (length < 10) throw new Error("Temporary passwords must be at least 10 characters");
  const all = UPPER + LOWER + DIGITS + SYMBOLS;
  const chars = [UPPER, LOWER, DIGITS, SYMBOLS].map((set) => set[randomInt(set.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export const PASSWORD_MIN_LENGTH = 10;

/** Returns an error message, or null when the password is acceptable. */
export function checkPasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > 128) return "Password is too long.";
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes < 3) return "Use at least three of: lowercase, uppercase, digits, symbols.";
  return null;
}

/**
 * Easy-to-read default password for a food shop, e.g. "Snacks@482731":
 * the shop's first word, @, then digits (always passes checkPasswordStrength).
 */
export function suggestShopPassword(shopName: string): string {
  const word = (shopName.match(/[A-Za-z]+/)?.[0] ?? "Shop").slice(0, 10).toLowerCase();
  const base = `${word[0].toUpperCase()}${word.slice(1)}@`;
  let digits = "";
  while (digits.length < 6 || base.length + digits.length < 12) digits += DIGITS[randomInt(DIGITS.length)];
  return base + digits;
}
