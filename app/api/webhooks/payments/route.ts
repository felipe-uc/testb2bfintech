import { NextResponse } from "next/server";

import {
  findSessionByFintocId,
  findSessionByPaymentIntentId,
  insertFunnelEvent,
  insertPaymentEvent,
  linkOrphanEventsByPaymentIntentId,
  updateSessionStatus,
} from "@/lib/db";
import { WEBHOOK_SIGNATURE_HEADER } from "@/lib/fintoc";
import { readBodyLimited } from "@/lib/ratelimit";
import { processWebhook, type WebhookStore } from "@/lib/webhook";

const store: WebhookStore = {
  findSessionByFintocId,
  findSessionByPaymentIntentId,
  linkOrphanEventsByPaymentIntentId,
  insertPaymentEvent,
  updateSessionStatus,
  insertFunnelEvent,
};

/**
 * POST /api/webhooks/payments
 * Lee el body crudo (la firma se calcula sobre él) y delega en processWebhook.
 */
export async function POST(req: Request) {
  const rawBody = await readBodyLimited(req);
  if (rawBody === null) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const secret = process.env.FINTOC_WEBHOOK_SECRET;
  if (!secret) {
    console.error("FINTOC_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const result = await processWebhook({
    rawBody,
    signatureHeader: req.headers.get(WEBHOOK_SIGNATURE_HEADER),
    secret,
    store,
  });

  // Logs: solo session_id, event_type y signature_valid (CLAUDE.md 12.3).
  if (result.log) console.log("webhook", result.log);

  return NextResponse.json(result.body, { status: result.status });
}
