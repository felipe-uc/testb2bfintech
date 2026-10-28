import type { Rule } from "./types.ts";

export const webhookInvalidSignature: Rule = {
  id: "webhook_invalid_signature",
  severity: "crítica",
  evaluate(s) {
    const invalid = s.webhooks.filter((w) => !w.signatureValid).length;
    if (!invalid) return null;
    return {
      ruleId: this.id,
      severity: this.severity,
      explanation: `Llegaron ${invalid} webhook(s) cuya firma no se pudo verificar.`,
      nextStep:
        "Secreto equivocado o body parseado antes de firmar: rota el whsec_ y verifica que se firma el body crudo.",
      facts: { invalid_webhooks: invalid },
    };
  },
};
