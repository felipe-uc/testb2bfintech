/**
 * Puente entre la base y el motor de reglas. Garantiza "un diagnóstico por
 * sesión, máximo" (CLAUDE.md 12.2): si ya existe, no evalúa nada.
 */
import { db, listFunnelEvents, listPaymentEvents, type SessionRow } from "../db";
import { diagnose, type Diagnosis } from "./index";

export interface StoredDiagnostic {
  rule_id: string;
  severity: string;
  explanation: string;
  next_step: string;
  created_at: Date;
}

export async function ensureDiagnostic(session: SessionRow): Promise<StoredDiagnostic[]> {
  const existing = await db()<StoredDiagnostic[]>`
    select rule_id, severity, explanation, next_step, created_at
    from diagnostics where session_id = ${session.id} order by created_at
  `;
  if (existing.length) return existing;

  const [funnel, webhooks] = await Promise.all([
    listFunnelEvents(session.id),
    listPaymentEvents(session.id),
  ]);
  const result: Diagnosis | null = diagnose({
    status: session.status,
    createdAt: session.created_at,
    expiresAt: session.expires_at,
    funnel: funnel.map((e) => ({ step: e.step, at: e.occurred_at, metadata: e.metadata })),
    webhooks: webhooks.map((w) => ({
      eventType: w.event_type,
      signatureValid: w.signature_valid,
      at: w.received_at,
    })),
    now: new Date(),
  });
  if (!result) return [];

  const [row] = await db()<StoredDiagnostic[]>`
    insert into diagnostics (session_id, rule_id, severity, explanation, next_step)
    values (${session.id}, ${result.ruleId}, ${result.severity}, ${result.explanation}, ${result.nextStep})
    returning rule_id, severity, explanation, next_step, created_at
  `;
  return [row];
}
