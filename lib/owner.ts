/**
 * `is_owner` se marca con una cookie secreta que solo el autor tiene
 * (CLAUDE.md 12.3). Valor en OWNER_COOKIE_SECRET; nunca un parámetro visible.
 */
import { timingSafeEqual } from "node:crypto";

export const OWNER_COOKIE = "al_owner";

export function isOwner(cookieHeader: string | null): boolean {
  const secret = process.env.OWNER_COOKIE_SECRET;
  if (!secret || !cookieHeader) return false;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${OWNER_COOKIE}=`));
  if (!match) return false;
  const value = decodeURIComponent(match.slice(OWNER_COOKIE.length + 1));
  const a = Buffer.from(value);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
