import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RULES } from "./diagnostics/index.ts";
import type { Diagnosis } from "./diagnostics/types.ts";
import { buildLlmInput, draftWording, LLM_MAX_TOKENS, LLM_MODEL, parseWording, RULE_CATALOG } from "./llm.ts";

const DIAGNOSIS: Diagnosis = {
  ruleId: "authorized_without_webhook",
  severity: "crítica",
  explanation: "texto fijo",
  nextStep: "paso fijo",
  facts: { minutes_since_authorization: 3 },
};

const GOOD = {
  explanation: "El banco autorizó el pago hace 3 minutos, pero tu servidor aún no recibe el webhook.",
  next_step: "Revisa la URL del endpoint, los eventos suscritos y que responda 200.",
};

/** fetch falso que registra la llamada y responde como la Messages API. */
function fakeFetch(text: string, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const silent = async <T>(fn: () => Promise<T>): Promise<T> => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
  }
};

describe("llm wording", () => {
  it("has a catalog entry for every per-session rule", () => {
    for (const rule of RULES) assert.ok(RULE_CATALOG[rule.id], rule.id);
  });

  it("sends only rule_id, severity and facts", () => {
    const input = buildLlmInput(DIAGNOSIS);
    assert.deepEqual(Object.keys(input).sort(), ["facts", "rule_id", "severity"]);
    assert.deepEqual(input.facts, { minutes_since_authorization: 3 });
  });

  it("returns the drafted wording and respects the request limits", async () => {
    const { impl, calls } = fakeFetch(JSON.stringify(GOOD));
    const wording = await draftWording(DIAGNOSIS, { apiKey: "test-key", fetchImpl: impl });
    assert.deepEqual(wording, { explanation: GOOD.explanation, nextStep: GOOD.next_step });

    assert.equal(calls.length, 1);
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.model, LLM_MODEL);
    assert.equal(body.max_tokens, LLM_MAX_TOKENS);
    assert.ok(body.max_tokens <= 400);
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal("temperature" in body, false);
    assert.deepEqual(JSON.parse(body.messages[0].content), buildLlmInput(DIAGNOSIS));
    assert.equal(String(calls[0].init.body).includes("texto fijo"), false);
  });

  it("does not call the provider without an API key", async () => {
    const { impl, calls } = fakeFetch(JSON.stringify(GOOD));
    assert.equal(await draftWording(DIAGNOSIS, { apiKey: "", fetchImpl: impl }), null);
    assert.equal(calls.length, 0);
  });

  it("does not call the provider for a rule outside the catalog", async () => {
    const { impl, calls } = fakeFetch(JSON.stringify(GOOD));
    const d = { ...DIAGNOSIS, ruleId: "unknown_rule" };
    assert.equal(await draftWording(d, { apiKey: "test-key", fetchImpl: impl }), null);
    assert.equal(calls.length, 0);
  });

  it("falls back on provider error", async () => {
    const { impl } = fakeFetch("{}", 500);
    assert.equal(await silent(() => draftWording(DIAGNOSIS, { apiKey: "test-key", fetchImpl: impl })), null);
  });

  it("falls back when the request throws or times out", async () => {
    const impl = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    assert.equal(await silent(() => draftWording(DIAGNOSIS, { apiKey: "test-key", fetchImpl: impl })), null);
  });

  it("falls back on output that is not the expected JSON", async () => {
    const { impl } = fakeFetch("No puedo ayudar con eso.");
    assert.equal(await silent(() => draftWording(DIAGNOSIS, { apiKey: "test-key", fetchImpl: impl })), null);
  });

  it("accepts JSON wrapped in a code fence", () => {
    const text = "```json\n" + JSON.stringify(GOOD) + "\n```";
    assert.ok(parseWording(text, buildLlmInput(DIAGNOSIS)));
  });

  it("rejects wording with numbers that are not in the facts or the rule", () => {
    const invented = { ...GOOD, explanation: "El banco autorizó el pago hace 45 minutos." };
    assert.equal(parseWording(JSON.stringify(invented), buildLlmInput(DIAGNOSIS)), null);
  });

  it("rejects empty or oversized fields", () => {
    const input = buildLlmInput(DIAGNOSIS);
    assert.equal(parseWording(JSON.stringify({ ...GOOD, next_step: " " }), input), null);
    assert.equal(parseWording(JSON.stringify({ ...GOOD, explanation: "a".repeat(401) }), input), null);
  });
});
