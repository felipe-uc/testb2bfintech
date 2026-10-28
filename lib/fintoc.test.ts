import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  signWebhookPayload,
  verifyWebhookSignature,
  type SignatureCheck,
} from "./fintoc.ts";

const reasonOf = (check: SignatureCheck) =>
  check.valid ? "valid" : check.reason;

// Fixture inventado a mano; no es un payload real (CLAUDE.md 12.3).
const SECRET = "whsec_fixture_not_a_real_secret";
const NOW = 1_700_000_000;
const BODY = JSON.stringify({
  id: "evt_fixture_0001",
  type: "payment_intent.succeeded",
  data: { id: "pi_fixture_0001", status: "succeeded", amount: 1000 },
});

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed body", () => {
    const header = signWebhookPayload(BODY, SECRET, NOW);
    assert.deepEqual(verifyWebhookSignature(BODY, header, SECRET, NOW), {
      valid: true,
    });
  });

  it("accepts a timestamp inside the tolerance window", () => {
    const header = signWebhookPayload(BODY, SECRET, NOW - 299);
    assert.equal(verifyWebhookSignature(BODY, header, SECRET, NOW).valid, true);
  });

  it("rejects a missing header", () => {
    assert.deepEqual(verifyWebhookSignature(BODY, null, SECRET, NOW), {
      valid: false,
      reason: "missing_header",
    });
  });

  it("rejects a malformed header", () => {
    assert.equal(
      reasonOf(verifyWebhookSignature(BODY, "garbage", SECRET, NOW)),
      "malformed_header",
    );
    assert.equal(
      reasonOf(verifyWebhookSignature(BODY, "t=abc,v1=00", SECRET, NOW)),
      "malformed_header",
    );
  });

  it("rejects a stale timestamp (replay)", () => {
    const header = signWebhookPayload(BODY, SECRET, NOW - 301);
    assert.equal(
      reasonOf(verifyWebhookSignature(BODY, header, SECRET, NOW)),
      "stale_timestamp",
    );
  });

  it("rejects a body that was altered after signing", () => {
    const header = signWebhookPayload(BODY, SECRET, NOW);
    const tampered = BODY.replace('"amount":1000', '"amount":999999');
    assert.equal(
      reasonOf(verifyWebhookSignature(tampered, header, SECRET, NOW)),
      "mismatch",
    );
  });

  it("rejects a signature made with another secret", () => {
    const header = signWebhookPayload(BODY, "whsec_other_fixture", NOW);
    assert.equal(
      reasonOf(verifyWebhookSignature(BODY, header, SECRET, NOW)),
      "mismatch",
    );
  });

  it("rejects a signature of the wrong length without throwing", () => {
    assert.equal(
      reasonOf(verifyWebhookSignature(BODY, `t=${NOW},v1=abcd`, SECRET, NOW)),
      "mismatch",
    );
  });
});
