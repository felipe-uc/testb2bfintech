import { hasStep, isPaid, type Rule, type SessionSnapshot } from "./types.ts";

/** Señales del widget que indican rechazo dentro del banco (DECISIONS.md, 2026-11-11). */
export const REJECTION_WIDGET_EVENTS = new Set(["payment_error", "back-to-checkout-buttons"]);

/** Razones documentadas con un siguiente paso propio; el resto usa el genérico. */
export const NEXT_STEP_BY_REASON: Record<string, string> = {
  new_contact_amount_limit_reached:
    "El banco limita el monto para contactos nuevos: sugiere un monto menor o repetir el pago, que ya no será contacto nuevo.",
  insufficient_funds: "Fondos insuficientes en la cuenta de origen: sugiere otra cuenta o reintentar más tarde.",
};

export const GENERIC_NEXT_STEP =
  "El banco rechazó dentro del widget; no hay webhook porque la sesión sigue abierta. Sugiere reintentar con otra cuenta. La razón se consulta a Fintoc cuando la sesión expire.";

/** Texto fijo del diagnóstico para una razón dada (también lo usa el enriquecimiento diferido). */
export function bankRejectedText(reason: string | null) {
  return {
    explanation: reason
      ? `El banco rechazó el pago: ${reason}.`
      : "El banco rechazó el pago en el widget; razón no disponible todavía.",
    nextStep: (reason && NEXT_STEP_BY_REASON[reason]) || GENERIC_NEXT_STEP,
  };
}

/** Hubo rechazo si el widget lo señaló tras iniciar el pago, o si ya se guardó la razón. */
export function rejectionSignaled(s: SessionSnapshot): boolean {
  if (hasStep(s, "payment_rejected_in_bank")) return true;
  const started = s.funnel.findIndex((e) => e.step === "widget_event" && e.metadata?.type === "payment_in_progress");
  if (started < 0) return false;
  return s.funnel
    .slice(started + 1)
    .some((e) => (e.step === "widget_event" || e.step === "widget_error") && REJECTION_WIDGET_EVENTS.has(String(e.metadata?.type)));
}

export const bankRejected: Rule = {
  id: "bank_rejected",
  severity: "media",
  evaluate(s) {
    if (isPaid(s) || s.webhooks.length || hasStep(s, "authorization_completed")) return null;
    if (!rejectionSignaled(s)) return null;
    const stored = [...s.funnel].reverse().find((e) => e.step === "payment_rejected_in_bank");
    const reason = typeof stored?.metadata?.error_reason === "string" ? stored.metadata.error_reason : null;
    const text = bankRejectedText(reason);
    return {
      ruleId: this.id,
      severity: this.severity,
      explanation: text.explanation,
      nextStep: text.nextStep,
      facts: { error_reason: reason ?? "unknown" },
    };
  },
};
