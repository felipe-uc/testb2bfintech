/**
 * Conexión a Postgres (Supabase, pooler en modo transacción) y consultas.
 * Solo se importa desde route handlers y server components (CLAUDE.md 12.1).
 */
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

declare global {
  // Evita abrir una conexión por cada hot reload en desarrollo.
  var __sql: Sql | undefined;
}

/** Conexión perezosa: se abre en la primera consulta, nunca al importar. */
export function db(): Sql {
  if (globalThis.__sql) return globalThis.__sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, {
    // Pooler en modo transacción: sin prepared statements.
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  globalThis.__sql = client;
  return client;
}

export type Channel = "shopify" | "woo_vtex" | "api" | "none";
export const CHANNELS: readonly Channel[] = ["shopify", "woo_vtex", "api", "none"];

export interface SessionRow {
  id: string;
  created_at: Date;
  updated_at: Date;
  channel: Channel;
  is_owner: boolean;
  fintoc_session_id: string | null;
  amount: number;
  status: string;
  expires_at: Date;
}

export interface PaymentEventRow {
  id: number;
  session_id: string | null;
  received_at: Date;
  event_type: string;
  fintoc_event_id: string;
  signature_valid: boolean;
}

export interface FunnelEventRow {
  id: number;
  session_id: string;
  step: string;
  occurred_at: Date;
  metadata: Record<string, unknown>;
}

export async function insertSession(input: {
  channel: Channel;
  isOwner: boolean;
  fintocSessionId: string;
  amount: number;
  status: string;
  expiresAt: Date;
}): Promise<SessionRow> {
  const [row] = await db()<SessionRow[]>`
    insert into sessions (channel, is_owner, fintoc_session_id, amount, status, expires_at)
    values (${input.channel}, ${input.isOwner}, ${input.fintocSessionId},
            ${input.amount}, ${input.status}, ${input.expiresAt})
    returning *
  `;
  return row;
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const [row] = await db()<SessionRow[]>`
    select * from sessions where id = ${id}
  `;
  return row ?? null;
}

export async function updateSessionStatus(
  sessionId: string,
  status: string,
): Promise<void> {
  await db()`
    update sessions set status = ${status}, updated_at = now()
    where id = ${sessionId}
  `;
}

export async function findSessionByFintocId(
  fintocSessionId: string,
): Promise<{ id: string } | null> {
  const [row] = await db()<{ id: string }[]>`
    select id from sessions where fintoc_session_id = ${fintocSessionId}
  `;
  return row ?? null;
}

/** Sesión cuyo checkout_session.finished guardado trae ese payment_intent.id anidado. */
export async function findSessionByPaymentIntentId(
  paymentIntentId: string,
): Promise<{ id: string } | null> {
  const [row] = await db()<{ id: string }[]>`
    select session_id as id from payment_events
    where session_id is not null
      and payload_raw->'data'->'payment_resource'->'payment_intent'->>'id' = ${paymentIntentId}
    limit 1
  `;
  return row ?? null;
}

export async function linkOrphanEventsByPaymentIntentId(
  paymentIntentId: string,
  sessionId: string,
): Promise<string[]> {
  const rows = await db()<{ event_type: string }[]>`
    update payment_events set session_id = ${sessionId}
    where session_id is null
      and event_type like 'payment_intent.%'
      and payload_raw->'data'->>'id' = ${paymentIntentId}
    returning event_type
  `;
  return rows.map((r) => r.event_type);
}

/**
 * Guarda el webhook crudo. Devuelve `false` si `fintoc_event_id` ya existía
 * (reenvío): el llamador no debe volver a procesarlo.
 */
export async function insertPaymentEvent(input: {
  sessionId: string | null;
  eventType: string;
  fintocEventId: string;
  signatureValid: boolean;
  payloadRaw: unknown;
}): Promise<boolean> {
  const rows = await db()`
    insert into payment_events (session_id, event_type, fintoc_event_id, signature_valid, payload_raw)
    values (${input.sessionId}, ${input.eventType}, ${input.fintocEventId},
            ${input.signatureValid}, ${db().json(input.payloadRaw as never)})
    on conflict (fintoc_event_id) do nothing
    returning id
  `;
  return rows.length > 0;
}

export async function listPaymentEvents(
  sessionId: string,
): Promise<PaymentEventRow[]> {
  // Sin payload_raw: nunca sale de la base hacia una respuesta (CLAUDE.md 12.3).
  return db()<PaymentEventRow[]>`
    select id, session_id, received_at, event_type, fintoc_event_id, signature_valid
    from payment_events where session_id = ${sessionId}
    order by received_at
  `;
}

export async function insertFunnelEvent(input: {
  sessionId: string;
  step: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db()`
    insert into funnel_events (session_id, step, metadata)
    values (${input.sessionId}, ${input.step}, ${db().json((input.metadata ?? {}) as never)})
  `;
}

export async function countFunnelEvents(sessionId: string): Promise<number> {
  const [row] = await db()<{ n: number }[]>`
    select count(*)::int as n from funnel_events where session_id = ${sessionId}
  `;
  return row.n;
}

export async function listFunnelEvents(
  sessionId: string,
): Promise<FunnelEventRow[]> {
  return db()<FunnelEventRow[]>`
    select * from funnel_events where session_id = ${sessionId}
    order by occurred_at
  `;
}
