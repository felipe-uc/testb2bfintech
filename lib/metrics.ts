/**
 * Consultas de /metrics (DECISIONS.md, 2026-10-28 "/metrics"). Solo agregados:
 * nunca sesiones individuales, payloads ni IDs de Fintoc (CLAUDE.md 11.3).
 */
import { db, type Channel } from "./db";

/** Pasos del funnel en orden; `session_created` se cuenta desde `sessions`. */
export const FUNNEL_STEPS = [
  "session_created",
  "widget_opened",
  "reached_bank",
  "authorization_completed",
  "webhook_verified",
  "payment_confirmed",
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export interface FunnelRow {
  channel: Channel | "total";
  counts: Record<FunnelStep, number>;
}

export interface Metrics {
  funnel: FunnelRow[];
  timing: { median_s: number | null; p90_s: number | null; paid: number };
  diagnostics: { rule_id: string; severity: string; n: number }[];
  /** Rechazos del banco (DECISIONS.md, 2026-11-11): diagnósticos `bank_rejected`. */
  bankRejections: { withReason: number; withoutReason: number; byReason: { reason: string; n: number }[] };
  orphanWebhooks: number;
  expiredWithoutWidget: number;
  sessions: number;
}

export async function getMetrics(): Promise<Metrics> {
  const sql = db();
  // Sin filtro por is_owner: /metrics muestra todas las sesiones (DECISIONS.md, 2026-11-11).
  const owner = sql``;

  const funnelRows = await sql<
    { channel: Channel; step: string; n: number }[]
  >`
    with steps as (
      select s.channel, 'session_created' as step, count(*)::int as n
      from sessions s where true ${owner}
      group by s.channel
      union all
      select s.channel, f.step, count(distinct f.session_id)::int
      from funnel_events f join sessions s on s.id = f.session_id
      where f.step in ('widget_opened', 'webhook_verified', 'payment_confirmed')
        -- un webhook de expiración no es un avance en el funnel
        and not (f.step = 'webhook_verified' and f.metadata->>'event_type' like '%.expired')
        ${owner}
      group by s.channel, f.step
      union all
      -- "llegó al banco" = el widget emitió payment_in_progress; se suma a quien
      -- autorizó o tuvo webhook (sesiones anteriores a registrar eventos del widget)
      select s.channel, 'reached_bank', count(distinct f.session_id)::int
      from funnel_events f join sessions s on s.id = f.session_id
      where (
          (f.step = 'widget_event' and f.metadata->>'type' = 'payment_in_progress')
          or f.step = 'authorization_completed'
          or (f.step = 'webhook_verified' and f.metadata->>'event_type' not like '%.expired')
        ) ${owner}
      group by s.channel
      union all
      -- "autorización" = el cliente autorizó en el banco: onSuccess del widget (solo
      -- dispara en éxito) o un webhook con resultado de pago (éxito, pendiente o falla)
      select s.channel, 'authorization_completed', count(distinct f.session_id)::int
      from funnel_events f join sessions s on s.id = f.session_id
      where (
          f.step = 'authorization_completed'
          or (f.step = 'webhook_verified' and f.metadata->>'event_type' not like '%.expired')
        ) ${owner}
      group by s.channel
    )
    select * from steps
  `;

  const byChannel = new Map<string, Record<FunnelStep, number>>();
  const empty = () =>
    Object.fromEntries(FUNNEL_STEPS.map((s) => [s, 0])) as Record<FunnelStep, number>;
  const total = empty();
  for (const r of funnelRows) {
    const row = byChannel.get(r.channel) ?? empty();
    row[r.step as FunnelStep] = r.n;
    byChannel.set(r.channel, row);
    total[r.step as FunnelStep] += r.n;
  }
  const funnel: FunnelRow[] = [
    { channel: "total", counts: total },
    ...[...byChannel.entries()]
      .sort((a, b) => b[1].session_created - a[1].session_created)
      .map(([channel, counts]) => ({ channel: channel as Channel, counts })),
  ];

  const [timing] = await sql<{ median_s: number | null; p90_s: number | null; paid: number }[]>`
    select
      percentile_cont(0.5) within group (order by extract(epoch from f.occurred_at - s.created_at))::float as median_s,
      percentile_cont(0.9) within group (order by extract(epoch from f.occurred_at - s.created_at))::float as p90_s,
      count(*)::int as paid
    from funnel_events f join sessions s on s.id = f.session_id
    where f.step = 'payment_confirmed' ${owner}
  `;

  const diagnostics = await sql<{ rule_id: string; severity: string; n: number }[]>`
    select d.rule_id, d.severity, count(*)::int as n
    from diagnostics d join sessions s on s.id = d.session_id
    where true ${owner}
    group by d.rule_id, d.severity order by n desc
  `;

  const rejectionRows = await sql<{ reason: string | null; n: number }[]>`
    select r.metadata->>'error_reason' as reason, count(*)::int as n
    from diagnostics d
    left join lateral (
      select f.metadata from funnel_events f
      where f.session_id = d.session_id and f.step = 'payment_rejected_in_bank'
      order by f.occurred_at desc limit 1
    ) r on true
    where d.rule_id = 'bank_rejected'
    group by 1 order by n desc
  `;
  const bankRejections = {
    withReason: rejectionRows.filter((r) => r.reason).reduce((a, r) => a + r.n, 0),
    withoutReason: rejectionRows.filter((r) => !r.reason).reduce((a, r) => a + r.n, 0),
    byReason: rejectionRows.filter((r): r is { reason: string; n: number } => Boolean(r.reason)),
  };

  const [{ n: orphanWebhooks }] = await sql<{ n: number }[]>`
    select count(*)::int as n from payment_events
    where session_id is null and signature_valid = true
  `;

  const [{ n: expiredWithoutWidget }] = await sql<{ n: number }[]>`
    select count(*)::int as n from sessions s
    where (s.status = 'expired' or s.expires_at < now()) ${owner}
      and not exists (
        select 1 from funnel_events f where f.session_id = s.id and f.step = 'widget_opened'
      )
  `;

  return {
    funnel,
    timing,
    diagnostics,
    bankRejections,
    orphanWebhooks,
    expiredWithoutWidget,
    sessions: total.session_created,
  };
}
