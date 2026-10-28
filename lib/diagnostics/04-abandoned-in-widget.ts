import { hasStep, isPaid, lastStepAt, minutesBetween, type Rule } from "./types.ts";

const THRESHOLD_MIN = 3;

export const abandonedInWidget: Rule = {
  id: "abandoned_in_widget",
  severity: "media",
  evaluate(s) {
    const openedAt = lastStepAt(s, "widget_opened");
    if (!openedAt || isPaid(s) || hasStep(s, "authorization_completed") || s.webhooks.length) return null;
    const minutes = minutesBetween(openedAt, s.now);
    if (minutes < THRESHOLD_MIN) return null;
    return {
      ruleId: this.id,
      severity: this.severity,
      explanation: `El widget se abrió hace ${minutes} minutos y no hubo autorización en el banco.`,
      nextStep: "Abandono dentro del banco: credenciales de prueba o cambio de opinión. Sin acción técnica.",
      facts: { minutes_since_widget_opened: minutes },
    };
  },
};
