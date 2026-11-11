/**
 * Redacción del diagnóstico con LLM (DECISIONS.md, 2026-11-11).
 *
 * Las reglas deciden; el LLM solo redacta. Recibe únicamente rule_id,
 * severidad y los facts de la regla (CLAUDE.md 12.2): nunca el payload del
 * webhook, IDs ni llaves. Cualquier fallo devuelve null y el llamador se
 * queda con el texto fijo de la regla. Este módulo nunca lanza.
 */
import type { Diagnosis } from "./diagnostics/types.ts";

export const LLM_MODEL = "claude-haiku-5-5";
export const LLM_MAX_TOKENS = 400;
const LLM_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 6000;
const MAX_FIELD_CHARS = 400;

/** Qué significa cada regla y qué acción recomienda (tabla de DECISIONS.md). */
export const RULE_CATALOG: Record<string, string> = {
  expired_without_widget:
    "La sesión de cobro expiró (duran 15 minutos) y nunca se abrió el widget de pago. Acción: fricción antes de pagar; revisar que el botón de pago sea visible y el monto claro.",
  widget_never_opened:
    "La sesión sigue viva pero pasaron varios minutos sin que se abriera el widget de pago. Acción: el cliente se fue antes de intentar; mirar la página previa al pago.",
  widget_load_error:
    "El widget de pago no pudo cargar. Acción: llave pública inválida o script bloqueado; verificar la llave pk_test_ y los bloqueadores del navegador.",
  bank_rejected:
    "El banco rechazó el pago dentro del widget y Fintoc registró la razón en el payment intent; no llegó webhook porque la sesión sigue abierta. Acción: según la razón; para new_contact_amount_limit_reached, sugerir un monto menor o repetir el pago.",
  abandoned_in_widget:
    "El widget se abrió pero no hubo autorización del banco ni webhook. Acción: abandono dentro del banco; no requiere acción técnica.",
  widget_reopened:
    "El widget se abrió más de una vez sin que el pago se completara. Acción: el cliente está reintentando; revisar si el primer intento falló dentro del banco.",
  authorized_without_webhook:
    "El banco autorizó el pago pero no llegó ningún webhook: el caso \"pagué y no llegó\". Acción: verificar la URL del endpoint, los eventos suscritos y que el endpoint responda 200.",
  webhook_invalid_signature:
    "Llegó al menos un webhook cuya firma no se pudo verificar. Acción: secreto equivocado o body parseado antes de verificar; rotar el secreto whsec_ y verificar sobre el body crudo.",
  payment_pending:
    "El pago lleva varios minutos en estado pendiente. Acción: el proveedor enviará un segundo webhook con el resultado; no reintentar, esperar.",
  payment_failed:
    "El pago terminó sin éxito según un webhook válido. Acción: el banco rechazó o el cliente canceló; sugerir reintentar el pago.",
};

export interface LlmInput {
  rule_id: string;
  severity: string;
  facts: Record<string, number | string>;
}

export interface Wording {
  explanation: string;
  nextStep: string;
}

/** Lo único que sale del servidor hacia el proveedor del LLM. */
export function buildLlmInput(d: Pick<Diagnosis, "ruleId" | "severity" | "facts">): LlmInput {
  return { rule_id: d.ruleId, severity: d.severity, facts: { ...d.facts } };
}

function systemPrompt(ruleId: string): string {
  return [
    "Redactas diagnósticos en un entorno de prueba de pagos por transferencia bancaria.",
    "Un motor de reglas ya decidió el diagnóstico; tú solo lo redactas. No cambies el diagnóstico ni agregues causas, cifras o datos que no estén en la entrada.",
    `Regla aplicada: ${ruleId}. ${RULE_CATALOG[ruleId]}`,
    "Escribe en castellano neutro, tuteando, para el dueño de un comercio que está integrando pagos: claro, concreto y sin alarmismo.",
    'Responde solo con JSON, sin texto adicional: {"explanation": "...", "next_step": "..."}.',
    "explanation: una o dos frases que digan qué pasó, usando las cifras de facts si las hay. next_step: una frase con la acción recomendada. Máximo 300 caracteres por campo.",
  ].join("\n");
}

const numbersIn = (text: string) => text.match(/\d+/g) ?? [];

/** Valida el texto del modelo: formato, largo y que no invente cifras. */
export function parseWording(text: string, input: LlmInput): Wording | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const { explanation, next_step: nextStep } = (parsed ?? {}) as Record<string, unknown>;
  if (typeof explanation !== "string" || typeof nextStep !== "string") return null;
  const clean = { explanation: explanation.trim(), nextStep: nextStep.trim() };
  for (const field of [clean.explanation, clean.nextStep]) {
    if (!field || field.length > MAX_FIELD_CHARS) return null;
  }
  const allowed = new Set([
    ...numbersIn(Object.values(input.facts).join(" ")),
    ...numbersIn(RULE_CATALOG[input.rule_id] ?? ""),
  ]);
  for (const n of numbersIn(`${clean.explanation} ${clean.nextStep}`)) {
    if (!allowed.has(n)) return null;
  }
  return clean;
}

export interface DraftOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Pide la redacción al LLM. Devuelve null (y el llamador usa el texto fijo)
 * si no hay llave, la regla no está en el catálogo, el proveedor falla o
 * demora, o la respuesta no pasa la validación.
 */
export async function draftWording(
  d: Pick<Diagnosis, "ruleId" | "severity" | "facts">,
  opts: DraftOptions = {},
): Promise<Wording | null> {
  const apiKey = opts.apiKey ?? process.env.LLM_API_KEY;
  if (!apiKey || !RULE_CATALOG[d.ruleId]) return null;
  const input = buildLlmInput(d);
  try {
    const res = await (opts.fetchImpl ?? fetch)(LLM_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        max_tokens: LLM_MAX_TOKENS,
        thinking: { type: "disabled" },
        system: systemPrompt(d.ruleId),
        messages: [{ role: "user", content: JSON.stringify(input) }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("llm_fallback", { rule_id: d.ruleId, reason: `http_${res.status}` });
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((b) => b.type === "text")?.text ?? "";
    const wording = parseWording(text, input);
    if (!wording) console.warn("llm_fallback", { rule_id: d.ruleId, reason: "invalid_output" });
    return wording;
  } catch {
    console.warn("llm_fallback", { rule_id: d.ruleId, reason: "request_failed" });
    return null;
  }
}
