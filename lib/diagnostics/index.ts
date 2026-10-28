/**
 * Motor de reglas: evalúa en el orden decidido en DECISIONS.md y devuelve
 * la primera que aplica. Una sesión con pago confirmado y sin regla no
 * genera diagnóstico. La regla 10 (webhook_without_session) no se asocia a
 * una sesión y se cuenta solo en /metrics.
 */
import { expiredWithoutWidget } from "./01-expired-without-widget.ts";
import { widgetNeverOpened } from "./02-widget-never-opened.ts";
import { widgetLoadError } from "./03-widget-load-error.ts";
import { abandonedInWidget } from "./04-abandoned-in-widget.ts";
import { widgetReopened } from "./05-widget-reopened.ts";
import { authorizedWithoutWebhook } from "./06-authorized-without-webhook.ts";
import { webhookInvalidSignature } from "./07-webhook-invalid-signature.ts";
import { paymentPending } from "./08-payment-pending.ts";
import { paymentFailed } from "./09-payment-failed.ts";
import type { Diagnosis, Rule, SessionSnapshot } from "./types.ts";

export type { Diagnosis, SessionSnapshot, Severity } from "./types.ts";

export const RULES: readonly Rule[] = [
  expiredWithoutWidget,
  widgetNeverOpened,
  widgetLoadError,
  abandonedInWidget,
  widgetReopened,
  authorizedWithoutWebhook,
  webhookInvalidSignature,
  paymentPending,
  paymentFailed,
];

export function diagnose(s: SessionSnapshot): Diagnosis | null {
  for (const rule of RULES) {
    const result = rule.evaluate(s);
    if (result) return result;
  }
  return null;
}
