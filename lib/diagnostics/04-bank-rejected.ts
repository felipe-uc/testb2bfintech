import { hasStep, isPaid, type Rule } from "./types.ts";

/** Razones documentadas con un siguiente paso propio; el resto usa el genérico. */
const NEXT_STEP_BY_REASON: Record<string, string> = {
  new_contact_amount_limit_reached:
    "El banco limita el monto para contactos nuevos: sugiere un monto menor o repetir el pago, que ya no será contacto nuevo.",
  insufficient_funds: "Fondos insuficientes en la cuenta de origen: sugiere otra cuenta o reintentar más tarde.",
};

const GENERIC_NEXT_STEP = "El banco rechazó dentro del widget; no llegó webhook porque la sesión sigue abierta. Sugiere reintentar con otra cuenta.";

export const bankRejected: Rule = {
  id: "bank_rejected",
  severity: "media",
  evaluate(s) {
    if (isPaid(s) || s.webhooks.length) return null;
    const hit = [...s.funnel].reverse().find((e) => e.step === "payment_rejected_in_bank");
    if (!hit || hasStep(s, "authorization_completed")) return null;
    const reason = typeof hit.metadata?.error_reason === "string" ? hit.metadata.error_reason : "unknown";
    return {
      ruleId: this.id,
      severity: this.severity,
      explanation: `El banco rechazó el pago: ${reason}.`,
      nextStep: NEXT_STEP_BY_REASON[reason] ?? GENERIC_NEXT_STEP,
      facts: { error_reason: reason },
    };
  },
};
