/**
 * Contrato de una regla de diagnóstico (DECISIONS.md, 2026-10-28
 * "Reglas de diagnóstico"). Reglas en TypeScript puro, sin I/O.
 */
export type Severity = "baja" | "media" | "alta" | "crítica";

/** Vista mínima de una sesión; la construye el llamador desde la base. */
export interface SessionSnapshot {
  status: string;
  createdAt: Date;
  expiresAt: Date;
  /** Pasos del funnel en orden cronológico. */
  funnel: { step: string; at: Date; metadata?: Record<string, unknown> }[];
  /** Webhooks recibidos para la sesión. */
  webhooks: { eventType: string; signatureValid: boolean; at: Date }[];
  now: Date;
}

export interface Diagnosis {
  ruleId: string;
  severity: Severity;
  explanation: string;
  nextStep: string;
  /** Lo único que recibirá el LLM además de ruleId y severity. */
  facts: Record<string, number | string>;
}

export interface Rule {
  id: string;
  severity: Severity;
  /** Devuelve el diagnóstico si la regla aplica; null si no. */
  evaluate(s: SessionSnapshot): Diagnosis | null;
}

export const minutesBetween = (a: Date, b: Date) =>
  Math.floor(Math.abs(b.getTime() - a.getTime()) / 60_000);

export const hasStep = (s: SessionSnapshot, step: string) =>
  s.funnel.some((e) => e.step === step);

export const countStep = (s: SessionSnapshot, step: string) =>
  s.funnel.filter((e) => e.step === step).length;

export const lastStepAt = (s: SessionSnapshot, step: string) => {
  const found = s.funnel.filter((e) => e.step === step);
  return found.length ? found[found.length - 1].at : null;
};

export const isPaid = (s: SessionSnapshot) =>
  s.status === "paid" || hasStep(s, "payment_confirmed");
