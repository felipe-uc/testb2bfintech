import { NextResponse } from "next/server";

import { getSession, listFunnelEvents, listPaymentEvents } from "@/lib/db";
import { ensureDiagnostic } from "@/lib/diagnostics/run";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/sessions/[id]
 * Estado + línea de tiempo + diagnóstico de una sola sesión.
 * Nunca devuelve payload_raw ni IDs de Fintoc.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!UUID_V4.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [funnel, payments, diagnostics] = await Promise.all([
    listFunnelEvents(id),
    listPaymentEvents(id),
    ensureDiagnostic(session),
  ]);

  return NextResponse.json({
    id: session.id,
    channel: session.channel,
    status: session.status,
    amount: session.amount,
    created_at: session.created_at,
    expires_at: session.expires_at,
    timeline: {
      funnel: funnel.map((e) => ({ step: e.step, at: e.occurred_at })),
      webhooks: payments.map((p) => ({
        event_type: p.event_type,
        signature_valid: p.signature_valid,
        at: p.received_at,
      })),
    },
    diagnostics,
  });
}
