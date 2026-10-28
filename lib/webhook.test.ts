import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { signWebhookPayload } from "./fintoc.ts";
import { processWebhook, type WebhookStore } from "./webhook.ts";

// Fixtures inventados a mano; no son payloads reales (CLAUDE.md 12.3).
const SECRET = "whsec_fixture_not_a_real_secret";
const NOW = 1_700_000_000;
const FINTOC_SESSION = "cs_fixture_0001";
const LOCAL_SESSION = "11111111-1111-4111-8111-111111111111";

const PI = "pi_fixture";

function finishedEvent(paymentStatus: string, id = "evt_fixture_finished") {
  return JSON.stringify({
    id,
    type: "checkout_session.finished",
    data: {
      id: FINTOC_SESSION,
      status: "finished",
      payment_resource: { payment_intent: { id: PI, status: paymentStatus } },
    },
  });
}

/** Como llega en producción: sin referencia a la checkout session. */
function intentEvent(type: string, id: string) {
  const status = type.split(".")[1];
  return JSON.stringify({ id, type, data: { id: PI, status, amount: 1000 } });
}

/** Store en memoria que imita la idempotencia por fintoc_event_id. */
function memoryStore() {
  const paymentEvents = new Map<
    string,
    { sessionId: string | null; signatureValid: boolean; eventType: string; piId: string | null }
  >();
  const funnel: string[] = [];
  const statuses: string[] = [];
  const store: WebhookStore = {
    async findSessionByFintocId(id) {
      return id === FINTOC_SESSION ? { id: LOCAL_SESSION } : null;
    },
    async findSessionByPaymentIntentId(piId) {
      for (const e of paymentEvents.values()) {
        if (e.sessionId && e.eventType === "checkout_session.finished" && e.piId === piId) {
          return { id: e.sessionId };
        }
      }
      return null;
    },
    async linkOrphanEventsByPaymentIntentId(piId, sessionId) {
      const linked: string[] = [];
      for (const e of paymentEvents.values()) {
        if (!e.sessionId && e.eventType.startsWith("payment_intent.") && e.piId === piId) {
          e.sessionId = sessionId;
          linked.push(e.eventType);
        }
      }
      return linked;
    },
    async insertPaymentEvent(input) {
      if (paymentEvents.has(input.fintocEventId)) return false;
      const raw = input.payloadRaw as { data?: { id?: string; payment_resource?: { payment_intent?: { id?: string } } } };
      paymentEvents.set(input.fintocEventId, {
        sessionId: input.sessionId,
        signatureValid: input.signatureValid,
        eventType: input.eventType,
        piId: input.eventType.startsWith("payment_intent.")
          ? (raw.data?.id ?? null)
          : (raw.data?.payment_resource?.payment_intent?.id ?? null),
      });
      return true;
    },
    async updateSessionStatus(_id, status) {
      statuses.push(status);
    },
    async insertFunnelEvent(input) {
      funnel.push(input.step);
    },
  };
  return { store, paymentEvents, funnel, statuses };
}

describe("processWebhook", () => {
  let mem: ReturnType<typeof memoryStore>;
  beforeEach(() => {
    mem = memoryStore();
  });

  const run = (rawBody: string, header: string | null) =>
    processWebhook({ rawBody, signatureHeader: header, secret: SECRET, store: mem.store, nowSeconds: NOW });

  it("confirms payment from checkout_session.finished with succeeded intent", async () => {
    const body = finishedEvent("succeeded");
    const res = await run(body, signWebhookPayload(body, SECRET, NOW));
    assert.equal(res.status, 200);
    assert.deepEqual(mem.statuses, ["paid"]);
    assert.deepEqual(mem.funnel, ["webhook_verified", "payment_confirmed"]);
  });

  it("maps a nested failed intent to session status failed, without confirming", async () => {
    const body = finishedEvent("failed");
    await run(body, signWebhookPayload(body, SECRET, NOW));
    assert.deepEqual(mem.statuses, ["failed"]);
    assert.deepEqual(mem.funnel, ["webhook_verified"]);
  });

  it("maps a nested pending intent to session status pending (seen in production)", async () => {
    const body = finishedEvent("pending");
    await run(body, signWebhookPayload(body, SECRET, NOW));
    assert.deepEqual(mem.statuses, ["pending"]);
    assert.deepEqual(mem.funnel, ["webhook_verified"]);
  });

  it("falls back to finished when the nested intent status is unknown", async () => {
    const body = finishedEvent("something_new");
    await run(body, signWebhookPayload(body, SECRET, NOW));
    assert.deepEqual(mem.statuses, ["finished"]);
  });

  it("confirms payment from payment_intent.succeeded linked by checkout_session", async () => {
    const body = JSON.stringify({
      id: "evt_fixture_pi",
      type: "payment_intent.succeeded",
      data: { id: "pi_fixture", status: "succeeded", checkout_session: FINTOC_SESSION },
    });
    await run(body, signWebhookPayload(body, SECRET, NOW));
    assert.deepEqual(mem.statuses, ["paid"]);
    assert.ok(mem.funnel.includes("payment_confirmed"));
  });

  it("stores the event with signature_valid=false and returns 400 on bad signature", async () => {
    const body = finishedEvent("succeeded");
    const res = await run(body, `t=${NOW},v1=deadbeef`);
    assert.equal(res.status, 400);
    assert.equal(mem.paymentEvents.get("evt_fixture_finished")?.signatureValid, false);
    assert.deepEqual(mem.statuses, []);
    assert.deepEqual(mem.funnel, []);
  });

  it("is idempotent: a resent event does not update the session twice", async () => {
    const body = finishedEvent("succeeded");
    const header = signWebhookPayload(body, SECRET, NOW);
    await run(body, header);
    const again = await run(body, header);
    assert.equal(again.status, 200);
    assert.equal(again.log?.duplicate, true);
    assert.deepEqual(mem.statuses, ["paid"]);
    assert.deepEqual(mem.funnel, ["webhook_verified", "payment_confirmed"]);
  });

  it("links a later payment_intent.* event through the nested intent id (pending → failed)", async () => {
    const finished = finishedEvent("pending");
    await run(finished, signWebhookPayload(finished, SECRET, NOW));
    const pending = intentEvent("payment_intent.pending", "evt_pi_pending");
    await run(pending, signWebhookPayload(pending, SECRET, NOW));
    const failed = intentEvent("payment_intent.failed", "evt_pi_failed");
    const res = await run(failed, signWebhookPayload(failed, SECRET, NOW));
    assert.equal(res.status, 200);
    assert.equal(res.log?.session_id, LOCAL_SESSION);
    assert.deepEqual(mem.statuses, ["pending", "pending", "failed"]);
    assert.ok(!mem.funnel.includes("payment_confirmed"));
  });

  it("confirms payment when payment_intent.succeeded follows a pending checkout", async () => {
    const finished = finishedEvent("pending");
    await run(finished, signWebhookPayload(finished, SECRET, NOW));
    const ok = intentEvent("payment_intent.succeeded", "evt_pi_ok");
    await run(ok, signWebhookPayload(ok, SECRET, NOW));
    assert.deepEqual(mem.statuses, ["pending", "paid"]);
    assert.ok(mem.funnel.includes("payment_confirmed"));
  });

  it("re-links an orphan payment_intent.succeeded that arrived before checkout_session.finished", async () => {
    const early = intentEvent("payment_intent.succeeded", "evt_pi_early");
    const first = await run(early, signWebhookPayload(early, SECRET, NOW));
    assert.equal(first.log?.session_id, null);
    assert.deepEqual(mem.statuses, []);
    const finished = finishedEvent("pending");
    await run(finished, signWebhookPayload(finished, SECRET, NOW));
    assert.equal(mem.paymentEvents.get("evt_pi_early")?.sessionId, LOCAL_SESSION);
    assert.deepEqual(mem.statuses, ["paid"]);
    assert.ok(mem.funnel.includes("payment_confirmed"));
  });

  it("stores an event that matches no local session and returns 200", async () => {
    const body = JSON.stringify({
      id: "evt_fixture_orphan",
      type: "checkout_session.finished",
      data: { id: "cs_unknown", status: "finished" },
    });
    const res = await run(body, signWebhookPayload(body, SECRET, NOW));
    assert.equal(res.status, 200);
    assert.equal(mem.paymentEvents.get("evt_fixture_orphan")?.sessionId, null);
    assert.deepEqual(mem.statuses, []);
  });

  it("rejects invalid JSON and events without id", async () => {
    assert.equal((await run("{not json", null)).status, 400);
    const noId = JSON.stringify({ type: "checkout_session.finished", data: {} });
    assert.equal((await run(noId, signWebhookPayload(noId, SECRET, NOW))).status, 400);
    assert.equal(mem.paymentEvents.size, 0);
  });

  it("never puts the payload in the log", async () => {
    const body = finishedEvent("succeeded");
    const res = await run(body, signWebhookPayload(body, SECRET, NOW));
    assert.deepEqual(Object.keys(res.log ?? {}).sort(), ["duplicate", "event_type", "session_id", "signature_valid"]);
  });
});
