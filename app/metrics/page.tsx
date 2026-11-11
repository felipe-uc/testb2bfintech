import { Suspense } from "react";

import { Badge, Card, CardTitle, Page, PageHeader } from "../ui";

import { FUNNEL_STEPS, getMetrics, type FunnelRow } from "@/lib/metrics";

const STAGES = [
  { label: "Registro en el Dashboard", instrumented: false },
  { label: "Verificación del negocio", instrumented: false },
  { label: "Habilitación de productos", instrumented: false },
  { label: "Integración (plugin o API)", instrumented: true },
  { label: "Primer pago de prueba", instrumented: true },
  { label: "Paso a live", instrumented: false },
  { label: "Primer pago real", instrumented: false },
];

const STEP_LABELS: Record<(typeof FUNNEL_STEPS)[number], string> = {
  session_created: "Sesión creada",
  widget_opened: "Widget abierto",
  reached_bank: "Llegó al banco",
  authorization_completed: "Autorización",
  webhook_verified: "Webhook verificado",
  payment_confirmed: "Pago confirmado",
};

const CHANNEL_LABELS: Record<string, string> = {
  total: "Total",
  shopify: "Shopify",
  woo_vtex: "WooCommerce / VTEX",
  api: "API propia",
  none: "Aún no vende online",
};

/** Nombre legible de cada regla (DECISIONS.md, "Reglas de diagnóstico"). */
const RULE_LABELS: Record<string, string> = {
  expired_without_widget: "Expiró sin abrir el widget",
  widget_never_opened: "Nunca abrió el widget",
  widget_load_error: "El widget no cargó",
  bank_rejected: "El banco rechazó en el widget",
  abandoned_in_widget: "Abandonó dentro del banco",
  widget_reopened: "Reabrió el widget",
  authorized_without_webhook: "Autorizó y no llegó webhook",
  webhook_invalid_signature: "Webhook con firma inválida",
  payment_pending: "Pago pendiente",
  payment_failed: "Pago fallido según webhook",
  webhook_without_session: "Webhook sin sesión",
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const secs = (s: number | null) =>
  s === null ? "–" : s < 90 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`;

export default function MetricsPage() {
  return (
    <Page wide>
      <PageHeader eyebrow="Activation Lab" title="Funnel de activación">
        <p>Solo agregados. Entorno de prueba, sin dinero real.</p>
      </PageHeader>
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const m = await getMetrics();

  return (
    <>
      <Card>
        <CardTitle hint="siete etapas, dos instrumentadas aquí">Etapas del onboarding de un comercio</CardTitle>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {STAGES.map((s, i) => (
            <li
              key={s.label}
              className={`flex min-h-24 flex-col rounded-lg border p-2 text-xs leading-snug break-words ${
                s.instrumented
                  ? "border-accent bg-indigo-50 dark:bg-indigo-950"
                  : "border-line text-muted"
              }`}
            >
              <span className="font-mono">{i + 1}</span>
              <span className="hyphens-auto font-medium">{s.label}</span>
              <span className="mt-auto pt-1 text-[10px] uppercase tracking-wide">
                {s.instrumented ? "instrumentada aquí" : "no instrumentada"}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">
          Este proyecto mide el tramo integración → primer pago de prueba. Las demás etapas viven dentro del proveedor.
        </p>
      </Card>

      <p className="text-right text-sm text-muted">{m.sessions} sesiones en total</p>

      <Card>
        <CardTitle hint="sesiones · conversión vs. paso anterior · acumulada">Funnel por paso y por canal</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 pr-3 font-medium">Canal</th>
                {FUNNEL_STEPS.map((s) => (
                  <th key={s} className="pb-2 pr-3 font-medium">{STEP_LABELS[s]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.funnel.map((row) => (
                <FunnelTr key={row.channel} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Mediana sesión → pago" value={secs(m.timing.median_s)} note={`${m.timing.paid} pagos confirmados`} />
        <Stat label="p90 sesión → pago" value={secs(m.timing.p90_s)} />
        <Stat label="Expiradas sin abrir el widget" value={String(m.expiredWithoutWidget)} />
      </div>

      <Card>
        <CardTitle hint={`webhooks válidos sin sesión: ${m.orphanWebhooks}`}>Diagnósticos por regla</CardTitle>
        {m.diagnostics.length === 0 ? (
          <p className="text-sm text-muted">Sin diagnósticos todavía.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {m.diagnostics.map((d) => (
                <tr key={d.rule_id} className="border-t border-line">
                  <td className="py-2 pr-3">
                    <span className="block">{RULE_LABELS[d.rule_id] ?? d.rule_id}</span>
                    <span className="block font-mono text-xs text-muted">{d.rule_id}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={d.severity === "crítica" ? "bad" : d.severity === "alta" ? "warn" : "neutral"}>{d.severity}</Badge>
                  </td>
                  <td className="py-2 text-right font-medium">{d.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card>
        <CardTitle hint="diagnósticos bank_rejected · la razón llega al expirar la sesión">Rechazos del banco</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted">Con razón conocida</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{m.bankRejections.withReason}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Sin razón todavía</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{m.bankRejections.withoutReason}</p>
          </div>
        </div>
        {m.bankRejections.byReason.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <tbody>
              {m.bankRejections.byReason.map((r) => (
                <tr key={r.reason} className="border-t border-line">
                  <td className="py-2 pr-3 font-mono text-xs">{r.reason}</td>
                  <td className="py-2 text-right font-medium">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function FunnelTr({ row }: { row: FunnelRow }) {
  const first = row.counts.session_created;
  return (
    <tr className={`border-t border-line ${row.channel === "total" ? "font-semibold" : ""}`}>
      <td className="py-2 pr-3">{CHANNEL_LABELS[row.channel] ?? row.channel}</td>
      {FUNNEL_STEPS.map((s, i) => {
        const n = row.counts[s];
        const prev = i === 0 ? n : row.counts[FUNNEL_STEPS[i - 1]];
        return (
          <td key={s} className="py-2 pr-3 align-top">
            <span className="block">{n}</span>
            {i > 0 && (
              <span className="block text-xs text-muted">
                {pct(n, prev)} · {pct(n, first)}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </Card>
  );
}
