import { hasStep, isPaid, minutesBetween, type Rule } from "./types.ts";

const THRESHOLD_MIN = 5;

export const widgetNeverOpened: Rule = {
  id: "widget_never_opened",
  severity: "baja",
  evaluate(s) {
    const minutes = minutesBetween(s.createdAt, s.now);
    if (minutes < THRESHOLD_MIN || hasStep(s, "widget_opened") || isPaid(s)) return null;
    return {
      ruleId: this.id,
      severity: this.severity,
      explanation: `Pasaron ${minutes} minutos desde que se creó la sesión y nadie abrió el widget.`,
      nextStep: "El cliente se fue antes de intentar pagar: mira la página previa al pago.",
      facts: { minutes_since_created: minutes },
    };
  },
};
