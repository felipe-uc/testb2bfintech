/**
 * Rechazo dentro del banco sin webhook (DECISIONS.md, 2026-11-11). Sin I/O
 * propio: recibe la consulta a Fintoc y la inserción para poder testearlo.
 */
import type { CheckoutSession } from "../fintoc.ts";

/** Eventos del widget que indican rechazo dentro del banco (DECISIONS.md, 2026-11-11). */
const REJECTION_WIDGET_EVENTS = new Set(["payment_error", "back-to-checkout-buttons"]);
const REJECTED_STATUSES = new Set(["failed", "rejected"]);


/**
 * Sin webhook y con señal de rechazo en el widget, consulta la checkout session
 * en Fintoc una sola vez y guarda el error_reason como `payment_rejected_in_bank`.
 * Devuelve el funnel con el evento nuevo (si lo hubo). Un fallo de red no rompe
 * la lectura de la sesión: se intentará en la próxima carga.
 */
export interface FunnelEvent {
  step: string;
  occurred_at: Date;
  metadata: Record<string, unknown>;
}

export interface BankRejectionInput<E extends FunnelEvent> {
  sessionId: string;
  fintocSessionId: string | null;
  funnel: E[];
  webhookCount: number;
  fetchSession: (id: string) => Promise<CheckoutSession>;
  insert: (e: { sessionId: string; step: string; metadata: Record<string, unknown> }) => Promise<void>;
}

export async function fetchBankRejection<E extends FunnelEvent>(
  { sessionId, fintocSessionId, funnel, webhookCount, fetchSession, insert }: BankRejectionInput<E>,
): Promise<(E | FunnelEvent)[]> {
  if (webhookCount || !fintocSessionId) return funnel;
  if (funnel.some((e) => e.step === "payment_rejected_in_bank")) return funnel;
  const signaled = funnel.some(
    (e) => (e.step === "widget_event" || e.step === "widget_error") && REJECTION_WIDGET_EVENTS.has(String(e.metadata?.type)),
  );
  if (!signaled) return funnel;

  let reason: string | null = null;
  try {
    const remote = await fetchSession(fintocSessionId);
    const intent = remote.payment_resource?.payment_intent;
    // Log mínimo (CLAUDE.md 12.3): estado de la sesión y del intento, sin payload ni IDs de Fintoc.
    console.log("bank_rejection_lookup", {
      session_id: sessionId,
      session_status: remote.status,
      has_payment_resource: Boolean(remote.payment_resource),
      intent_status: intent?.status ?? null,
      error_reason: intent?.error_reason ?? null,
    });
    if (!intent || !REJECTED_STATUSES.has(String(intent.status))) return funnel;
    reason = intent.error_reason ?? "unknown";
  } catch (err) {
    console.warn("bank_rejection_lookup_failed", { session_id: sessionId, reason: err instanceof Error ? err.message : "unknown" });
    return funnel;
  }
  const metadata = { error_reason: reason };
  await insert({ sessionId, step: "payment_rejected_in_bank", metadata });
  return [...funnel, { step: "payment_rejected_in_bank", occurred_at: new Date(), metadata }];
}

