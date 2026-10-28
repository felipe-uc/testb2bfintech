import { hasStep, type Rule } from "./types.ts";

export const expiredWithoutWidget: Rule = {
  id: "expired_without_widget",
  severity: "baja",
  evaluate(s) {
    const expired = s.status === "expired" || s.expiresAt <= s.now;
    if (!expired || hasStep(s, "widget_opened")) return null;
    return {
      ruleId: this.id,
      severity: this.severity,
      explanation: "La sesión expiró sin que se abriera el widget de pago.",
      nextStep:
        "Fricción antes de pagar: revisa que el botón de pago sea visible y el monto quede claro.",
      facts: {},
    };
  },
};
