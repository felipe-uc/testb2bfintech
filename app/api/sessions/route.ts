import { NextResponse } from "next/server";

import { CHANNELS, insertFunnelEvent, insertSession, type Channel } from "@/lib/db";
import { createCheckoutSession, FintocApiError } from "@/lib/fintoc";
import { isOwner } from "@/lib/owner";
import { allow, clientIp, readBodyLimited } from "@/lib/ratelimit";

const SESSIONS_PER_IP_PER_HOUR = 10;

/**
 * POST /api/sessions
 * Body: { channel: "shopify" | "woo_vtex" | "api" | "none" }
 * Crea la checkout session en Fintoc y la fila en `sessions`.
 */
export async function POST(req: Request) {
  if (!allow(clientIp(req), SESSIONS_PER_IP_PER_HOUR, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  const body = await readBodyLimited(req);
  if (body === null) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let channel: Channel | undefined;
  try {
    const parsed = JSON.parse(body || "{}") as { channel?: unknown };
    if (CHANNELS.includes(parsed.channel as Channel)) {
      channel = parsed.channel as Channel;
    }
  } catch {
    /* body inválido: cae en el 400 de abajo */
  }
  if (!channel) {
    return NextResponse.json({ error: "invalid_channel" }, { status: 400 });
  }

  try {
    const fintocSession = await createCheckoutSession();
    const session = await insertSession({
      channel,
      isOwner: isOwner(req.headers.get("cookie")),
      fintocSessionId: fintocSession.id,
      amount: fintocSession.amount,
      status: fintocSession.status,
      expiresAt: new Date(fintocSession.expires_at),
    });
    await insertFunnelEvent({ sessionId: session.id, step: "session_created" });

    return NextResponse.json(
      {
        id: session.id,
        status: session.status,
        expires_at: session.expires_at,
        session_token: fintocSession.session_token,
      },
      { status: 201 },
    );
  } catch (err) {
    // Mensaje genérico al usuario; detalle solo en logs (CLAUDE.md 12.3).
    const status = err instanceof FintocApiError ? err.status : "db";
    console.error("POST /api/sessions failed", { status });
    return NextResponse.json({ error: "session_creation_failed" }, { status: 502 });
  }
}
