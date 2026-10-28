import type { Rule } from "./types.ts";

const FAILED = new Set(["failed", "rejected", "expired"]);

export const paymentFailed: Rule = {
  id: "payment_failed",
  severity: "media",
  evaluate(s) {
    const validWebhook = s.webhooks.some((w) => w.signatureValid);
    if (!FAILED.has(s.status) || !validWebhook) return null;
    return {
      ruleId: this.id,
      severity: this.severity,
      explanation: `El pago terminó en estado "${s.status}" según el webhook de Fintoc.`,
      nextStep: "El banco rechazó o el cliente canceló: sugiere reintentar el pago.",
      facts: { final_status: s.status },
    };
  },
};
