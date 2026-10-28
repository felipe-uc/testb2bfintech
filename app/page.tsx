"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { tokenKey } from "@/lib/widget";
import { buttonPrimary, Card, Page, PageHeader, TestBadge } from "./ui";

const CHANNELS = [
  { id: "shopify", label: "Shopify", hint: "Uso el plugin oficial en mi tienda" },
  { id: "woo_vtex", label: "WooCommerce o VTEX", hint: "Uso el plugin oficial en mi tienda" },
  { id: "api", label: "API propia", hint: "Mi sistema crea la sesión y abre el widget" },
  { id: "none", label: "Aún no vendo online", hint: "Quiero ver cómo funciona antes" },
] as const;

const STEPS = ["Elige tu canal", "Crea una sesión de cobro", "Paga con el banco de prueba", "Mira el funnel en vivo"];

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
      if (res.status === 429) throw new Error("Demasiadas sesiones desde tu red. Intenta en una hora.");
      if (!res.ok) throw new Error("No se pudo crear la sesión. Intenta de nuevo.");
      const data = (await res.json()) as { id: string; session_token: string | null };
      if (data.session_token) sessionStorage.setItem(tokenKey(data.id), data.session_token);
      router.push(`/s/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setBusy(false);
    }
  }

  return (
    <Page>
      <PageHeader eyebrow="Activation Lab" title="Del “quiero cobrar” al webhook confirmado, medido paso a paso.">
        <p>
          Completa un pago por transferencia de punta a punta en un entorno de prueba. Cada paso del funnel queda
          registrado y, si algo falla, el sistema te dice por qué.
        </p>
        <div className="mt-3"><TestBadge /></div>
      </PageHeader>

      <ol className="grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-line font-mono text-[10px] text-foreground">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <Link
        href="/casos"
        className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 transition hover:border-amber-500 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
      >
        <span className="text-lg leading-none">💡</span>
        <span>
          <span className="font-medium">Antes de pagar, revisa los casos a probar →</span>
          <span className="mt-0.5 block opacity-90">
            El banco de prueba tiene cuentas que terminan en éxito, falla o pendiente. Así provocas cada diagnóstico.
          </span>
        </span>
      </Link>

      <Card>
        <h2 className="mb-3 font-semibold">¿Cómo vendes hoy?</h2>
        <div className="flex flex-col gap-2">
          {CHANNELS.map((c) => {
            const active = channel === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannel(c.id)}
                aria-pressed={active}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                  active ? "border-accent bg-indigo-50 dark:bg-indigo-950" : "border-line hover:border-stone-400 dark:hover:border-stone-500"
                }`}
              >
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${active ? "border-accent bg-accent" : "border-stone-400"}`}>
                  {active && <span className="h-2 w-2 rounded-full bg-accent-ink" />}
                </span>
                <span>
                  <span className="block font-medium">{c.label}</span>
                  <span className="block text-xs text-muted">{c.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={start} disabled={!channel || busy} className={`${buttonPrimary} mt-4 w-full py-3`}>
          {busy ? "Creando sesión…" : "Crear sesión de cobro · 1.000 CLP de prueba"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>
    </Page>
  );
}
