import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchBankRejectionReason } from "./bank-rejection.ts";

const T0 = new Date("2026-11-11T12:00:00Z");
const min = (n: number) => new Date(T0.getTime() + n * 60_000);
const ev = (step: string, metadata: Record<string, unknown> = {}) => ({ step, occurred_at: T0, metadata });
const quiet = async (fn: () => Promise<unknown>) => {
  const { log, warn } = console;
  console.log = () => {};
  console.warn = () => {};
  try { return await fn(); } finally { console.log = log; console.warn = warn; }
};
const base = {
  sessionId: "s1",
  fintocSessionId: "cs_test_fake",
  expiresAt: min(15),
  funnel: [ev("widget_event", { type: "back-to-checkout-buttons" })],
  sessionExpiredByWebhook: false,
  insert: async () => {},
};
const failed = async () => ({ payment_resource: { payment_intent: { status: "failed", error_reason: "new_contact_amount_limit_reached" } } }) as never;

describe("fetchBankRejectionReason", () => {
  it("does not call Fintoc while the session is alive", async () => {
    let calls = 0;
    const fetchSession = async () => { calls++; return failed(); };
    const r = await fetchBankRejectionReason({ ...base, now: min(5), fetchSession });
    assert.deepEqual(r, { looked: false });
    assert.equal(calls, 0);
  });

  it("looks up once after expiry (by time or by webhook) and stores the reason", async () => {
    const inserted: string[] = [];
    const insert = async (e: { step: string }) => { inserted.push(e.step); };
    const r = await quiet(() => fetchBankRejectionReason({ ...base, now: min(15), fetchSession: failed, insert }));
    assert.deepEqual(r, { looked: true, reason: "new_contact_amount_limit_reached" });
    assert.deepEqual(inserted, ["bank_lookup_done", "payment_rejected_in_bank"]);
    const byWebhook = await quiet(() => fetchBankRejectionReason({ ...base, now: min(1), sessionExpiredByWebhook: true, fetchSession: failed }));
    assert.equal((byWebhook as { looked: boolean }).looked, true);
  });

  it("marks the lookup done even without a reason, and never repeats it", async () => {
    const inserted: string[] = [];
    const insert = async (e: { step: string }) => { inserted.push(e.step); };
    const inProgress = async () => ({ payment_resource: { payment_intent: { status: "in_progress", error_reason: null } } }) as never;
    const r = await quiet(() => fetchBankRejectionReason({ ...base, now: min(16), fetchSession: inProgress, insert }));
    assert.deepEqual(r, { looked: true, reason: null });
    assert.deepEqual(inserted, ["bank_lookup_done"]);
    let calls = 0;
    const again = async () => { calls++; return failed(); };
    const r2 = await fetchBankRejectionReason({ ...base, now: min(16), funnel: [...base.funnel, ev("bank_lookup_done")], fetchSession: again });
    assert.deepEqual(r2, { looked: false });
    assert.equal(calls, 0);
  });

  it("leaves no marker when Fintoc fails, so it retries on the next load", async () => {
    const inserted: string[] = [];
    const insert = async (e: { step: string }) => { inserted.push(e.step); };
    const failing = async () => { throw new Error("network"); };
    const r = await quiet(() => fetchBankRejectionReason({ ...base, now: min(16), fetchSession: failing, insert }));
    assert.deepEqual(r, { looked: false });
    assert.deepEqual(inserted, []);
  });
});
