import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchBankRejection } from "./bank-rejection.ts";

const ev = (step: string, type?: string) => ({ step, occurred_at: new Date(), metadata: (type ? { type } : {}) as Record<string, unknown> });
const noInsert = async () => {};
const base = { sessionId: "s1", fintocSessionId: "cs_test_fake", webhookCount: 0, insert: noInsert };

describe("fetchBankRejection", () => {
  it("does not call Fintoc without a rejection signal or with a webhook", async () => {
    let calls = 0;
    const fetchSession = async () => { calls++; throw new Error("should not be called"); };
    await fetchBankRejection({ ...base, funnel: [ev("widget_opened"), ev("widget_event", "opened")], fetchSession });
    await fetchBankRejection({ ...base, funnel: [ev("widget_event", "payment_error")], webhookCount: 1, fetchSession });
    assert.equal(calls, 0);
  });

  it("returns the funnel unchanged when the intent is not failed or Fintoc errors", async () => {
    const funnel = [ev("widget_event", "back-to-checkout-buttons")];
    const inProgress = async () => ({ payment_resource: { payment_intent: { status: "in_progress", error_reason: null } } }) as never;
    assert.equal(await fetchBankRejection({ ...base, funnel, fetchSession: inProgress }), funnel);
    const failing = async () => { throw new Error("network"); };
    assert.equal(await fetchBankRejection({ ...base, funnel, fetchSession: failing }), funnel);
  });

  it("stores the error_reason once and never asks Fintoc again", async () => {
    const inserted: string[] = [];
    const failed = async () => ({ payment_resource: { payment_intent: { status: "failed", error_reason: "new_contact_amount_limit_reached" } } }) as never;
    const out = await fetchBankRejection({
      ...base, funnel: [ev("widget_event", "back-to-checkout-buttons")], fetchSession: failed,
      insert: async (e) => { inserted.push(e.step); },
    });
    assert.deepEqual(inserted, ["payment_rejected_in_bank"]);
    assert.equal(out.at(-1)?.metadata.error_reason, "new_contact_amount_limit_reached");
    let calls = 0;
    const again = async () => { calls++; throw new Error("no"); };
    assert.equal(await fetchBankRejection({ ...base, funnel: out, fetchSession: again }), out);
    assert.equal(calls, 0);
  });
});
