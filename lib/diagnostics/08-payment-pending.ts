import { lastStepAt, minutesBetween, type Rule } from "./types.ts";

const THRESHOLD_MIN = 5;

export const paymentPending: Rule = {
  id: "payment_pending",
  severity: "media",
  evaluate(s) {
    if (s.status !== "pending") return null;
    const since = lastStepAt(s, "webhook_verified") ?? s.createdAt;
    const minutes = minutesBetween(since, s.now);
    if (minutes < THRESHOLD_MIN) return null;
    return {
      ruleId: this.id,
      severity: this.severity,
      explanation: `El pago lleva ${minutes} minutos en estado pendiente.`,
      nextStep: "Fintoc enviará un segundo webhook cuando se resuelva. No reintentes el pago: espera.",
      facts: { minutes_pending: minutes },
    };
  },
};
