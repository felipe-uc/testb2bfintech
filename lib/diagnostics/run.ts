/**
 * Puente entre la base y el motor de reglas. Garantiza "un diagnóstico por
 * sesión, máximo" (CLAUDE.md 12.2): si ya existe, no evalúa nada.
 *
 * La fila se inserta primero con el texto fijo de la regla y solo quien la
 * insertó llama al LLM: así hay como máximo una llamada por sesión, y si el
 * LLM falla el diagnóstico ya está guardado con el texto fijo.
 */
import { db, listFunnelEvents, listPaymentEvents, type SessionRow } from "../db";
import { draftWording } from "../llm";
import { diagnose, type Diagnosis } from "./index";

export interface StoredDiagnostic {
  rule_id: string;
  severity: string;
  explanation: string;
  next_step: string;
  created_at: Date;
}

const readDiagnostics = (sessionId: string) => db()<StoredDiagnostic[]>`
  select rule_id, severity, explanation, next_step, created_at
  from diagnostics where session_id = ${sessionId} order by created_at
`;

export async function ensureDiagnostic(session: SessionRow): Promise<StoredDiagnostic[]> {
  const existing = await readDiagnostics(session.id);
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

  const inserted = await db()<(StoredDiagnostic & { id: string })[]>`
    insert into diagnostics (session_id, rule_id, severity, explanation, next_step)
    select ${session.id}, ${result.ruleId}, ${result.severity}, ${result.explanation}, ${result.nextStep}
    where not exists (select 1 from diagnostics where session_id = ${session.id})
    returning id, rule_id, severity, explanation, next_step, created_at
  `;
  // Otra lectura simultánea ya lo creó: se devuelve lo guardado, sin llamar al LLM.
  if (!inserted.length) return readDiagnostics(session.id);

  const { id, ...row } = inserted[0];
  const wording = await draftWording(result);
  if (!wording) return [row];

  await db()`
    update diagnostics set explanation = ${wording.explanation}, next_step = ${wording.nextStep}
    where id = ${id}
  `;
  return [{ ...row, explanation: wording.explanation, next_step: wording.nextStep }];
}
