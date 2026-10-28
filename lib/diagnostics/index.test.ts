import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diagnose, RULES, type SessionSnapshot } from "./index.ts";

const T0 = new Date("2026-10-28T12:00:00Z");
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

function snapshot(partial: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    status: "created",
    createdAt: T0,
    expiresAt: min(15),
    funnel: [{ step: "session_created", at: T0 }],
    webhooks: [],
    now: min(1),
    ...partial,
  };
}

describe("diagnose", () => {
  it("has the ten-minus-one rules in the decided order", () => {
    assert.deepEqual(
      RULES.map((r) => r.id),
      [
        "expired_without_widget",
        "widget_never_opened",
        "widget_load_error",
        "abandoned_in_widget",
        "widget_reopened",
        "authorized_without_webhook",
        "webhook_invalid_signature",
        "payment_pending",
        "payment_failed",
      ],
    );
  });

  it("returns null for a fresh session and for a paid one", () => {
    assert.equal(diagnose(snapshot()), null);
    assert.equal(
      diagnose(
        snapshot({
          status: "paid",
          now: min(10),
          funnel: [
            { step: "session_created", at: T0 },
            { step: "widget_opened", at: min(1) },
            { step: "webhook_verified", at: min(3) },
            { step: "payment_confirmed", at: min(3) },
            { step: "authorization_completed", at: min(3) },
          ],
          webhooks: [{ eventType: "checkout_session.finished", signatureValid: true, at: min(3) }],
        }),
      ),
      null,
    );
  });

  it("1 expired_without_widget wins over widget_never_opened once expired", () => {
    const d = diagnose(snapshot({ now: min(16) }));
    assert.equal(d?.ruleId, "expired_without_widget");
  });

  it("2 widget_never_opened after 5 minutes", () => {
    assert.equal(diagnose(snapshot({ now: min(4) })), null);
    const d = diagnose(snapshot({ now: min(5) }));
    assert.equal(d?.ruleId, "widget_never_opened");
    assert.equal(d?.facts.minutes_since_created, 5);
  });

  it("3 widget_load_error only with metadata.type = widget_load", () => {
    const base = [{ step: "session_created", at: T0 }];
    assert.equal(
      diagnose(snapshot({ funnel: [...base, { step: "widget_error", at: min(1), metadata: { type: "other" } }] })),
      null,
    );
    const d = diagnose(
      snapshot({ funnel: [...base, { step: "widget_error", at: min(1), metadata: { type: "widget_load" } }] }),
    );
    assert.equal(d?.ruleId, "widget_load_error");
    assert.equal(d?.severity, "alta");
  });

  it("4 abandoned_in_widget after 3 minutes without authorization", () => {
    const funnel = [
      { step: "session_created", at: T0 },
      { step: "widget_opened", at: min(1) },
    ];
    assert.equal(diagnose(snapshot({ funnel, now: min(3) })), null);
    const d = diagnose(snapshot({ funnel, now: min(4) }));
    assert.equal(d?.ruleId, "abandoned_in_widget");
  });

  it("5 widget_reopened waits 3 minutes after the last open on a live session", () => {
    // Con webhook pendiente la regla 4 no aplica; la 8 necesita 5 min desde el webhook.
    const base = {
      status: "pending",
      funnel: [
        { step: "session_created", at: T0 },
        { step: "widget_opened", at: min(1) },
        { step: "webhook_verified", at: min(1) },
        { step: "widget_opened", at: min(2) },
      ],
      webhooks: [{ eventType: "payment_intent.pending", signatureValid: true, at: min(1) }],
    };
    assert.equal(diagnose(snapshot({ ...base, now: min(2) })), null);
    assert.equal(diagnose(snapshot({ ...base, now: min(4) })), null);
    const d = diagnose(snapshot({ ...base, now: min(5) }));
    assert.equal(d?.ruleId, "widget_reopened");
    assert.equal(d?.facts.widget_opens, 2);
  });

  it("4 abandoned_in_widget never fires on a paid session", () => {
    const d = diagnose(
      snapshot({
        status: "paid",
        funnel: [
          { step: "session_created", at: T0 },
          { step: "widget_opened", at: min(1) },
        ],
        now: min(10),
      }),
    );
    assert.equal(d, null);
  });

  it("5 widget_reopened fires at once on a terminal (failed) session", () => {
    const d = diagnose(
      snapshot({
        status: "failed",
        funnel: [
          { step: "session_created", at: T0 },
          { step: "widget_opened", at: min(1) },
          { step: "widget_opened", at: min(2) },
          { step: "webhook_verified", at: min(2) },
        ],
        webhooks: [{ eventType: "payment_intent.failed", signatureValid: true, at: min(2) }],
        now: min(2),
      }),
    );
    assert.equal(d?.ruleId, "widget_reopened");
  });

  it("5 does not fire once the session is paid, even after a reopen", () => {
    const d = diagnose(
      snapshot({
        status: "paid",
        funnel: [
          { step: "session_created", at: T0 },
          { step: "widget_opened", at: min(1) },
          { step: "widget_opened", at: min(2) },
          { step: "payment_confirmed", at: min(3) },
        ],
        now: min(10),
      }),
    );
    assert.equal(d, null);
  });

  it("6 authorized_without_webhook after 2 minutes is critical", () => {
    const funnel = [
      { step: "session_created", at: T0 },
      { step: "widget_opened", at: min(1) },
      { step: "authorization_completed", at: min(2) },
    ];
    assert.equal(diagnose(snapshot({ funnel, now: min(3) })), null);
    const d = diagnose(snapshot({ funnel, now: min(4) }));
    assert.equal(d?.ruleId, "authorized_without_webhook");
    assert.equal(d?.severity, "crítica");
  });

  it("7 webhook_invalid_signature when any webhook failed verification", () => {
    const d = diagnose(
      snapshot({
        funnel: [
          { step: "session_created", at: T0 },
          { step: "widget_opened", at: min(1) },
        ],
        webhooks: [{ eventType: "checkout_session.finished", signatureValid: false, at: min(2) }],
        now: min(2),
      }),
    );
    assert.equal(d?.ruleId, "webhook_invalid_signature");
  });

  it("8 payment_pending after 5 minutes in pending", () => {
    const base = {
      status: "pending",
      funnel: [
        { step: "session_created", at: T0 },
        { step: "widget_opened", at: min(1) },
        { step: "authorization_completed", at: min(2) },
        { step: "webhook_verified", at: min(2) },
      ],
      webhooks: [{ eventType: "payment_intent.pending", signatureValid: true, at: min(2) }],
    };
    assert.equal(diagnose(snapshot({ ...base, now: min(6) })), null);
    assert.equal(diagnose(snapshot({ ...base, now: min(7) }))?.ruleId, "payment_pending");
  });

  it("9 payment_failed on a final failed status with a valid webhook", () => {
    const d = diagnose(
      snapshot({
        status: "rejected",
        funnel: [
          { step: "session_created", at: T0 },
          { step: "widget_opened", at: min(1) },
          { step: "authorization_completed", at: min(2) },
          { step: "webhook_verified", at: min(2) },
        ],
        webhooks: [{ eventType: "payment_intent.rejected", signatureValid: true, at: min(2) }],
        now: min(2),
      }),
    );
    assert.equal(d?.ruleId, "payment_failed");
    assert.equal(d?.facts.final_status, "rejected");
  });

  it("facts never contain free text or payloads, only numbers and short strings", () => {
    for (const rule of RULES) {
      const d = rule.evaluate(
        snapshot({
          status: "rejected",
          now: min(20),
          funnel: [
            { step: "session_created", at: T0 },
            { step: "widget_opened", at: min(1) },
            { step: "widget_opened", at: min(2) },
            { step: "authorization_completed", at: min(3) },
          ],
          webhooks: [{ eventType: "x", signatureValid: false, at: min(4) }],
        }),
      );
      if (!d) continue;
      for (const v of Object.values(d.facts)) {
        assert.ok(typeof v === "number" || (typeof v === "string" && v.length < 32));
      }
    }
  });
});
