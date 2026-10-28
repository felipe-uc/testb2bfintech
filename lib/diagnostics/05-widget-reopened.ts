import { countStep, isPaid, lastStepAt, minutesBetween, type Rule } from "./types.ts";

/** Mismo umbral que la regla 4: sin él, un reintento que luego paga quedaba diagnosticado. */
const THRESHOLD_MIN = 3;

export const widgetReopened: Rule = {
  id: "widget_reopened",
  severity: "media",
  evaluate(s) {
    const opens = countStep(s, "widget_opened");
    if (opens < 2 || isPaid(s)) return null;
    const lastOpen = lastStepAt(s, "widget_opened");
    const minutes = lastOpen ? minutesBetween(lastOpen, s.now) : 0;
    const terminal = ["failed", "rejected", "expired"].includes(s.status) || s.expiresAt <= s.now;
    if (!terminal && minutes < THRESHOLD_MIN) return null;
    return {
      ruleId: this.id,
      severity: this.severity,
      explanation: `El widget se abrió ${opens} veces sin que el pago se completara.`,
      nextStep: "El cliente reintenta: revisa si el primer intento falló dentro del banco.",
      facts: { widget_opens: opens, minutes_since_last_open: minutes },
    };
  },
};
