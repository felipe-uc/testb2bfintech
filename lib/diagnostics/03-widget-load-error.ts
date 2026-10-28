import type { Rule } from "./types.ts";

export const widgetLoadError: Rule = {
  id: "widget_load_error",
  severity: "alta",
  evaluate(s) {
    const hit = s.funnel.some(
      (e) => e.step === "widget_error" && e.metadata?.type === "widget_load",
    );
    if (!hit) return null;
    return {
      ruleId: this.id,
      severity: this.severity,
      explanation: "El widget de pago no se pudo cargar en el navegador.",
      nextStep:
        "Llave pública inválida o script bloqueado: verifica la llave pk_test_ y los bloqueadores del navegador.",
      facts: {},
    };
  },
};
