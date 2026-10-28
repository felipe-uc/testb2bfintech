/**
 * Cliente mínimo de la API de Fintoc. Único archivo del proyecto que habla
 * con el proveedor (ver DECISIONS.md, 2026-10-28 "Cliente de Fintoc").
 *
 * Solo se usan dos endpoints y la verificación de firma del webhook.
 * Referencia: https://docs.fintoc.com/docs/webhooks-validating
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const API_BASE_URL = "https://api.fintoc.com";

/** Monto fijo en modo test, en CLP sin decimales (CLAUDE.md 12.2). */
export const SESSION_AMOUNT_CLP = 1000;
export const SESSION_CURRENCY = "CLP";
/** Expiración de la checkout session (DECISIONS.md, 2026-10-28). */
export const SESSION_TTL_MINUTES = 15;

export type CheckoutSessionStatus =
  | "created"
  | "in_progress"
  | "expired"
  | "finished";

export interface CheckoutSession {
  id: string;
  status: CheckoutSessionStatus;
  amount: number;
  currency: string;
  expires_at: string;
  /** Token para abrir el widget. Expira 10 min después de crearse. */
  session_token: string | null;
  mode: "test" | "live";
}

export class FintocApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "FintocApiError";
    this.status = status;
  }
}

function secretKey(): string {
  const key = process.env.FINTOC_SECRET_KEY;
  if (!key) throw new Error("FINTOC_SECRET_KEY is not set");
  if (!key.startsWith("sk_test_")) {
    // Regla dura: el proyecto vive en modo test (CLAUDE.md 12.1).
    throw new Error("FINTOC_SECRET_KEY must be a test key (sk_test_)");
  }
  return key;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: secretKey(),
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    // No se reenvía el cuerpo del error al usuario (CLAUDE.md 12.3).
    throw new FintocApiError(res.status, `Fintoc API ${res.status} on ${path}`);
  }
  return (await res.json()) as T;
}

/**
 * Crea una checkout session en modo embebido (widget), con monto fijo y
 * expiración de SESSION_TTL_MINUTES desde ahora.
 */
export function createCheckoutSession(
  now: Date = new Date(),
): Promise<CheckoutSession> {
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MINUTES * 60_000);
  return request<CheckoutSession>("/v2/checkout_sessions", {
    method: "POST",
    body: JSON.stringify({
      amount: SESSION_AMOUNT_CLP,
      currency: SESSION_CURRENCY,
      ui_mode: "embedded",
      expires_at: expiresAt.toISOString(),
    }),
  });
}

export function getCheckoutSession(id: string): Promise<CheckoutSession> {
  return request<CheckoutSession>(
    `/v2/checkout_sessions/${encodeURIComponent(id)}`,
  );
}

export const WEBHOOK_SIGNATURE_HEADER = "fintoc-signature";
const DEFAULT_TOLERANCE_SECONDS = 300;

export type SignatureCheck =
  | { valid: true }
  | { valid: false; reason: "missing_header" | "malformed_header" | "stale_timestamp" | "mismatch" };

/**
 * Verifica el header `Fintoc-Signature` (`t=<unix>,v1=<hex>`): HMAC-SHA256
 * con el secreto del endpoint sobre `${t}.${rawBody}`, comparación en tiempo
 * constante, tolerancia de 5 minutos. Nunca lanza: devuelve el motivo para
 * registrarlo en `payment_events.signature_valid`.
 */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): SignatureCheck {
  if (!header) return { valid: false, reason: "missing_header" };

  let timestamp: string | undefined;
  let signature: string | undefined;
  for (const part of header.split(",")) {
    const [key, value] = part.split("=");
    if (key === "t") timestamp = value;
    else if (key === "v1") signature = value;
  }
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) {
    return { valid: false, reason: "malformed_header" };
  }

  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    return { valid: false, reason: "stale_timestamp" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "mismatch" };
  }
  return { valid: true };
}

/** Firma un body para tests y fixtures. No se usa en producción. */
export function signWebhookPayload(
  rawBody: string,
  secret: string,
  timestampSeconds: number,
): string {
  const v1 = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
  return `t=${timestampSeconds},v1=${v1}`;
}
