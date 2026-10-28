import { NextResponse } from "next/server";

import { countFunnelEvents, getSession, insertFunnelEvent } from "@/lib/db";
import { readBodyLimited } from "@/lib/ratelimit";

const MAX_EVENTS_PER_SESSION = 100;
const STEPS = new Set([
  "widget_opened",
  "widget_closed",
  "authorization_completed",
  "widget_error",
]);

/**
 * POST /api/events
 * Body: { session_id: uuid, step: string, metadata?: object }
 * Registra un evento de funnel disparado desde el navegador.
 */
export async function POST(req: Request) {
  const body = await readBodyLimited(req);
  if (body === null) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let input: { session_id?: unknown; step?: unknown; metadata?: unknown };
  try {
    input = JSON.parse(body || "{}");
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sessionId = typeof input.session_id === "string" ? input.session_id : "";
  const step = typeof input.step === "string" ? input.step : "";
  if (!STEPS.has(step) || !sessionId) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }

  const session = await getSession(sessionId).catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if ((await countFunnelEvents(sessionId)) >= MAX_EVENTS_PER_SESSION) {
    return NextResponse.json({ error: "too_many_events" }, { status: 429 });
  }

  const metadata =
    input.metadata && typeof input.metadata === "object"
      ? (input.metadata as Record<string, unknown>)
      : {};
  await insertFunnelEvent({ sessionId, step, metadata });

  return NextResponse.json({ ok: true }, { status: 201 });
}
