"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { tokenKey } from "@/lib/widget";
import { buttonPrimary, Card, clp, LinkButton, Page, SummaryRow, TestBadge } from "./ui";

const CHANNELS = [
  { id: "shopify", label: "Shopify", hint: "Uso el plugin oficial en mi tienda" },
  { id: "woo_vtex", label: "WooCommerce o VTEX", hint: "Uso el plugin oficial en mi tienda" },
  { id: "api", label: "API propia", hint: "Mi sistema crea la sesión y abre el widget" },
  { id: "none", label: "Aún no vendo online", hint: "Quiero ver cómo funciona antes" },
] as const;

const PRODUCT = { name: "Taza de cerámica Aurora", detail: "Esmalte terracota · 350 ml · hecha a mano", price: 1000 };

export default function Home() {
  const router = useRouter();
  const [channel, setChannel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!channel) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      if (res.status === 429) throw new Error("Demasiados pedidos desde tu red. Intenta en una hora.");
      if (!res.ok) throw new Error("No se pudo iniciar el pago. Intenta de nuevo.");
      const data = (await res.json()) as { id: string; session_token: string | null };
      if (data.session_token) sessionStorage.setItem(tokenKey(data.id), data.session_token);
      router.push(`/s/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setBusy(false);
    }
  }

  return (
    <Page wide>
      <div className="flex flex-col gap-2">
        <TestBadge />
        <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">Finalizar compra</h1>
        <p className="max-w-2xl text-sm text-muted sm:text-base">
          Completa un pago por transferencia como lo haría un cliente de esta tienda. Cada paso queda registrado y,
          si algo falla, el sistema te explica por qué.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="mb-4 font-display text-lg font-medium">Para el experimento: ¿cómo vendes hoy?</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {CHANNELS.map((c) => {
                const active = channel === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChannel(c.id)}
                    aria-pressed={active}
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                      active ? "border-accent bg-accent-soft" : "border-line hover:border-accent/60"
                    }`}
                  >
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${active ? "border-accent" : "border-line"}`}>
                      {active && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                    </span>
                    <span>
                      <span className="block font-medium">{c.label}</span>
                      <span className="block text-xs text-muted">{c.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted">Se guarda como canal de la sesión para separar el funnel por tipo de comercio.</p>
          </Card>

          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">¿Qué resultado quieres provocar?</p>
              <p className="mt-0.5 text-sm text-muted">
                El banco de prueba decide según la cuenta que uses: éxito, rechazo o pendiente.
              </p>
            </div>
            <LinkButton href="/casos" secondary>Ver cuentas de prueba</LinkButton>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-20">
          <h2 className="mb-4 font-display text-lg font-medium">Tu pedido</h2>
          <div className="flex gap-4">
            <div
              aria-hidden
              className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-accent-soft"
            >
              <span className="h-10 w-10 rounded-b-full rounded-t-md border-4 border-accent" />
            </div>
            <div className="min-w-0">
              <p className="font-medium">{PRODUCT.name}</p>
              <p className="text-xs text-muted">{PRODUCT.detail}</p>
              <p className="mt-1 text-sm">Cantidad: 1</p>
            </div>
          </div>
          <div className="mt-4">
            <SummaryRow label="Subtotal" value={clp(PRODUCT.price)} />
            <SummaryRow label="Envío" value="Gratis" />
            <SummaryRow label="Total" value={`${clp(PRODUCT.price)} CLP`} strong />
          </div>
          <button type="button" onClick={start} disabled={!channel || busy} className={`${buttonPrimary} mt-5 w-full`}>
            {busy ? "Iniciando pago…" : "Pagar con transferencia bancaria"}
          </button>
          {!channel && !busy && <p className="mt-2 text-center text-xs text-muted">Elige primero cómo vendes hoy.</p>}
          {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
          <p className="mt-4 text-center text-[11px] text-muted">Pago de prueba. No se cobra dinero real.</p>
        </Card>
      </div>
    </Page>
  );
}
