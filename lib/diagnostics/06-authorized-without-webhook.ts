import { lastStepAt, minutesBetween, type Rule } from "./types.ts";

const THRESHOLD_MIN = 2;

export const authorizedWithoutWebhook: Rule = {
  id: "authorized_without_webhook",
  severity: "crítica",
  evaluate(s) {
    const authAt = lastStepAt(s, "authorization_completed");
    if (!authAt || s.webhooks.length) return null;
    const minutes = minutesBetween(authAt, s.now);
    if (minutes < THRESHOLD_MIN) return null;
    return {
      ruleId: this.id,
      severity: this.severity,
      explanation: `El banco autorizó el pago hace ${minutes} minutos y no ha llegado ningún webhook.`,
      nextStep:
        "Es el caso \"pagué y no llegó\": verifica la URL del endpoint, los eventos suscritos y que responda 200.",
      facts: { minutes_since_authorization: minutes },
    };
  },
};
