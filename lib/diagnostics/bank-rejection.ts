/**
 * Razón del rechazo del banco, diferida (DECISIONS.md, 2026-11-11, segunda
 * entrada). Solo cuando la sesión ya expiró, una sola vez por sesión; el
 * resultado (con o sin razón) se marca con el evento `bank_lookup_done`.
 * Sin I/O propio: recibe la consulta a Fintoc y la inserción para testearlo.
 */
import type { CheckoutSession } from "../fintoc.ts";

const REJECTED_STATUSES = new Set(["failed", "rejected"]);

export interface FunnelEvent {
  step: string;
  occurred_at: Date;
  metadata: Record<string, unknown>;
}

export interface BankReasonInput<E extends FunnelEvent> {
  sessionId: string;
  fintocSessionId: string | null;
  expiresAt: Date;
  now: Date;
  funnel: E[];
  /** Hubo webhook `checkout_session.expired` para la sesión. */
  sessionExpiredByWebhook: boolean;
  fetchSession: (id: string) => Promise<CheckoutSession>;
  insert: (e: { sessionId: string; step: string; metadata: Record<string, unknown> }) => Promise<void>;
}

export type BankReasonResult = { looked: false } | { looked: true; reason: string | null };

export async function fetchBankRejectionReason<E extends FunnelEvent>(
  { sessionId, fintocSessionId, expiresAt, now, funnel, sessionExpiredByWebhook, fetchSession, insert }: BankReasonInput<E>,
): Promise<BankReasonResult> {
  if (!fintocSessionId) return { looked: false };
  if (funnel.some((e) => e.step === "bank_lookup_done")) return { looked: false };
  const expired = sessionExpiredByWebhook || now.getTime() >= expiresAt.getTime();
  if (!expired) return { looked: false };

  let reason: string | null = null;
  let intentStatus: string | null = null;
  try {
    const remote = await fetchSession(fintocSessionId);
    const intent = remote.payment_resource?.payment_intent;
    intentStatus = intent?.status ?? null;
    if (intent && REJECTED_STATUSES.has(String(intent.status))) reason = intent.error_reason ?? "unknown";
  } catch (err) {
    console.warn("bank_lookup_failed", { session_id: sessionId, reason: err instanceof Error ? err.message : "unknown" });
    return { looked: false };
  }
  // Log mínimo (CLAUDE.md 11.3): estados y razón, sin payload ni IDs de Fintoc.
  console.log("bank_lookup", { session_id: sessionId, intent_status: intentStatus, error_reason: reason });
  await insert({ sessionId, step: "bank_lookup_done", metadata: { intent_status: intentStatus } });
  if (reason !== null) {
    await insert({ sessionId, step: "payment_rejected_in_bank", metadata: { error_reason: reason } });
  }
  return { looked: true, reason };
}
