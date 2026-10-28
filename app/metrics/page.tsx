import Link from "next/link";
import { Suspense } from "react";

import { Badge, Card, CardTitle, Page, PageHeader } from "../ui";

import { FUNNEL_STEPS, getMetrics, type FunnelRow, type Scope } from "@/lib/metrics";

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

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const secs = (s: number | null) =>
  s === null ? "–" : s < 90 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`;

export default function MetricsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  return (
    <Page wide>
      <PageHeader eyebrow="Activation Lab" title="Funnel de activación">
        <p>Solo agregados. Entorno de prueba, sin dinero real.</p>
      </PageHeader>
      <Suspense fallback={<p className="text-muted">Cargando…</p>}>
        <Content searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope: raw } = await searchParams;
  const scope: Scope = raw === "mine" ? "mine" : "all";
  const m = await getMetrics(scope);

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

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">Ver:</span>
        <ScopeLink current={scope} value="all" label="todos" />
        <ScopeLink current={scope} value="mine" label="solo yo" />
        <span className="ml-auto text-muted">{m.sessions} sesiones</span>
      </div>

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
                  <td className="py-2 pr-3 font-mono text-xs">{d.rule_id}</td>
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
    </>
  );
}

function ScopeLink({ current, value, label }: { current: Scope; value: Scope; label: string }) {
  const active = current === value;
  return (
    <Link
      href={value === "all" ? "/metrics" : `/metrics?scope=${value}`}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3 py-1 transition ${
        active ? "border-foreground bg-foreground text-background" : "border-line hover:border-stone-400"
      }`}
    >
      {label}
    </Link>
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
