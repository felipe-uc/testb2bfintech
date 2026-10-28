/**
 * Lógica del webhook de pagos, separada del route handler para poder
 * testearla sin base de datos. El handler solo lee la request y pasa un
 * `store` real; los tests pasan uno en memoria.
 *
 * Orden de las reglas no negociables (CLAUDE.md sección 5):
 * 1. Verificar la firma sobre el body crudo; registrar signature_valid aunque falle.
 * 2. Guardar siempre el payload crudo, idempotente por fintoc_event_id.
 * 3. Solo si la firma es válida y el evento es nuevo, actualizar la sesión.
 */
import { verifyWebhookSignature } from "./fintoc.ts";

export interface FintocEvent {
  id?: unknown;
  type?: unknown;
  data?: {
    id?: unknown;
    status?: unknown;
    checkout_session?: unknown;
    payment_resource?: { payment_intent?: { id?: unknown; status?: unknown } } | null;
  };
}

export interface WebhookStore {
  findSessionByFintocId(fintocSessionId: string): Promise<{ id: string } | null>;
  /**
   * Los eventos `payment_intent.*` no referencian la checkout session
   * (verificado 2026-10-28). Se enlazan por el `payment_intent.id` anidado en
   * el `checkout_session.finished` ya guardado.
   */
  findSessionByPaymentIntentId(paymentIntentId: string): Promise<{ id: string } | null>;
  /** Asocia eventos huérfanos de ese intent a la sesión; devuelve sus tipos. */
  linkOrphanEventsByPaymentIntentId(paymentIntentId: string, sessionId: string): Promise<string[]>;
  /** Devuelve false si fintoc_event_id ya existía (reenvío). */
  insertPaymentEvent(input: {
    sessionId: string | null;
    eventType: string;
    fintocEventId: string;
    signatureValid: boolean;
    payloadRaw: unknown;
  }): Promise<boolean>;
  updateSessionStatus(sessionId: string, status: string): Promise<void>;
  insertFunnelEvent(input: {
    sessionId: string;
    step: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
  /** Para el log: solo estos campos, nunca el payload (CLAUDE.md 12.3). */
  log?: { session_id: string | null; event_type: string; signature_valid: boolean; duplicate: boolean };
}

/** Estado de `sessions` según el evento, cuando no es un pago exitoso. */
const STATUS_BY_EVENT: Record<string, string> = {
  "checkout_session.finished": "finished",
  "payment_intent.pending": "pending",
  "payment_intent.failed": "failed",
  "payment_intent.rejected": "rejected",
  "payment_intent.expired": "expired",
  "checkout_session.expired": "expired",
};

/**
 * `checkout_session.finished` trae el resultado del pago anidado en
 * `data.payment_resource.payment_intent.status` (docs: Checkout session object).
 * Verificado en producción el 2026-10-28: llega con `succeeded` y con `pending`.
 */
export function nestedIntentStatus(event: FintocEvent): string | null {
  if (event.type !== "checkout_session.finished") return null;
  const status = event.data?.payment_resource?.payment_intent?.status;
  return typeof status === "string" ? status : null;
}

/** `pi_...` del evento: el propio `data.id` en `payment_intent.*`, o el anidado en `checkout_session.finished`. */
export function paymentIntentIdOf(event: FintocEvent): string | null {
  const data = event.data ?? {};
  if (typeof event.type === "string" && event.type.startsWith("payment_intent.")) {
    return typeof data.id === "string" ? data.id : null;
  }
  const nested = data.payment_resource?.payment_intent?.id;
  return typeof nested === "string" ? nested : null;
}

export function isSuccessfulPayment(event: FintocEvent): boolean {
  if (event.type === "payment_intent.succeeded") return true;
  return nestedIntentStatus(event) === "succeeded";
}

/** Estado de la sesión que implica el evento; `paid` para un pago exitoso. */
export function sessionStatusFor(event: FintocEvent, eventType: string): string | undefined {
  if (isSuccessfulPayment(event)) return "paid";
  const nested = nestedIntentStatus(event);
  if (nested && ["pending", "failed", "rejected", "expired"].includes(nested)) return nested;
  return STATUS_BY_EVENT[eventType];
}

/** Busca el id de checkout session dentro del evento, según su tipo. */
export function fintocSessionIdOf(event: FintocEvent): string | null {
  const data = event.data ?? {};
  if (typeof event.type === "string" && event.type.startsWith("checkout_session.")) {
    return typeof data.id === "string" ? data.id : null;
  }
  const cs = data.checkout_session;
  if (typeof cs === "string") return cs;
  if (cs && typeof cs === "object" && typeof (cs as { id?: unknown }).id === "string") {
    return (cs as { id: string }).id;
  }
  return null;
}

export async function processWebhook(input: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  store: WebhookStore;
  nowSeconds?: number;
}): Promise<WebhookResult> {
  const { rawBody, signatureHeader, secret, store } = input;

  const check = verifyWebhookSignature(rawBody, signatureHeader, secret, input.nowSeconds);

  let event: FintocEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "invalid_json" } };
  }
  const eventId = typeof event.id === "string" ? event.id : null;
  const eventType = typeof event.type === "string" ? event.type : "unknown";
  if (!eventId) return { status: 400, body: { error: "missing_event_id" } };

  const fintocSessionId = fintocSessionIdOf(event);
  const paymentIntentId = paymentIntentIdOf(event);
  let session = fintocSessionId ? await store.findSessionByFintocId(fintocSessionId) : null;
  if (!session && paymentIntentId) {
    session = await store.findSessionByPaymentIntentId(paymentIntentId);
  }

  const isNew = await store.insertPaymentEvent({
    sessionId: session?.id ?? null,
    eventType,
    fintocEventId: eventId,
    signatureValid: check.valid,
    payloadRaw: event,
  });

  const log = {
    session_id: session?.id ?? null,
    event_type: eventType,
    signature_valid: check.valid,
    duplicate: !isNew,
  };

  if (!check.valid) return { status: 400, body: { error: "invalid_signature" }, log };
  if (!isNew || !session) return { status: 200, body: { received: true }, log };

  let paid = isSuccessfulPayment(event);
  let nextStatus = sessionStatusFor(event, eventType);

  // Si el payment_intent.* llegó antes que el checkout_session.finished, quedó
  // huérfano: se enlaza ahora y su resultado manda sobre el estado anidado.
  if (eventType === "checkout_session.finished" && paymentIntentId) {
    const linked = await store.linkOrphanEventsByPaymentIntentId(paymentIntentId, session.id);
    if (linked.includes("payment_intent.succeeded")) {
      paid = true;
      nextStatus = "paid";
    } else {
      const terminal = linked.find((t) => STATUS_BY_EVENT[t] && STATUS_BY_EVENT[t] !== "pending");
      if (terminal) nextStatus = STATUS_BY_EVENT[terminal];
    }
  }

  if (nextStatus) await store.updateSessionStatus(session.id, nextStatus);

  await store.insertFunnelEvent({
    sessionId: session.id,
    step: "webhook_verified",
    metadata: { event_type: eventType },
  });
  if (paid) await store.insertFunnelEvent({ sessionId: session.id, step: "payment_confirmed" });

  return { status: 200, body: { received: true }, log };
}
