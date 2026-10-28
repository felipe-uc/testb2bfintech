/**
 * Límite por IP en memoria (CLAUDE.md 12.2 y 12.3): la IP nunca se guarda,
 * solo un hash con sal que vive en el proceso. En Vercel cada instancia tiene
 * su propia memoria, así que el límite es aproximado; suficiente para frenar
 * abuso en un proyecto personal sin agregar dependencias.
 */
import { createHash } from "node:crypto";

const buckets = new Map<string, number[]>();

function hashIp(ip: string): string {
  const salt = process.env.OWNER_COOKIE_SECRET ?? "no-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

/** Devuelve `true` si la petición está dentro del límite. */
export function allow(
  ip: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const key = hashIp(ip);
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 10_000) buckets.clear(); // tope de memoria
  return true;
}

export const MAX_BODY_BYTES = 64 * 1024;

/** Lee el body como texto rechazando más de 64 KB (CLAUDE.md 12.2). */
export async function readBodyLimited(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  const text = await req.text();
  return Buffer.byteLength(text) > MAX_BODY_BYTES ? null : text;
}
