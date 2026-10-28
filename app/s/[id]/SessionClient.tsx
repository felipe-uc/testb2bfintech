"use client";


import { useCallback, useEffect, useRef, useState } from "react";

import { loadFintocScript, tokenKey, type FintocWidget } from "@/lib/widget";
import { Badge, buttonPrimary, Card, CardTitle, Page, PageHeader } from "../../ui";

interface SessionView {
  id: string;
  channel: string;
  status: string;
  amount: number;
  created_at: string;
  expires_at: string;
  timeline: {
    funnel: { step: string; at: string }[];
    webhooks: { event_type: string; signature_valid: boolean; at: string }[];
  };
  diagnostics: { rule_id: string; severity: string; explanation: string; next_step: string }[];
}

const POLL_MS = 4000;
const POLL_LIMIT_MS = 15 * 60 * 1000; // CLAUDE.md 12.2

const STEP_LABELS: Record<string, string> = {
  session_created: "Sesión de cobro creada",
  widget_opened: "Widget abierto",
  widget_closed: "Widget cerrado sin completar",
  widget_error: "Error en el widget",
  authorization_completed: "Autorización completada en el banco",
  webhook_verified: "Webhook recibido y firma verificada",
  payment_confirmed: "Pago confirmado",
};

const STATUS_LABELS: Record<string, string> = {
  created: "Esperando pago",
  in_progress: "Pago en curso",
  pending: "Pago pendiente de confirmación",
  paid: "Pago confirmado",
  finished: "Checkout finalizado",
  failed: "Pago fallido",
  rejected: "Pago rechazado",
  expired: "Sesión expirada",
};

const STATUS_TONE: Record<string, "neutral" | "ok" | "warn" | "bad" | "accent"> = {
  created: "accent",
  in_progress: "accent",
  pending: "warn",
  paid: "ok",
  finished: "ok",
  failed: "bad",
  rejected: "bad",
  expired: "neutral",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CL", { hour12: false });
}

export default function SessionClient({ id }: { id: string }) {
  const [session, setSession] = useState<SessionView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pollingStopped, setPollingStopped] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const widgetRef = useRef<FintocWidget | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/sessions/${id}`, { cache: "no-store" });
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (res.ok) {
      setSession((await res.json()) as SessionView);
      setHasToken(Boolean(sessionStorage.getItem(tokenKey(id))));
    }
  }, [id]);

  useEffect(() => {
    const startedAt = Date.now();
    const first = setTimeout(refresh, 0);
    const timer = setInterval(() => {
      if (Date.now() - startedAt > POLL_LIMIT_MS) {
        clearInterval(timer);
        setPollingStopped(true);
        return;
      }
      refresh();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [id, refresh]);

  const track = useCallback(
    (step: string, metadata?: Record<string, unknown>) =>
      fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: id, step, metadata }),
      }).then(() => refresh()),
    [id, refresh],
  );

  async function pay() {
    setWidgetError(null);
    const sessionToken = sessionStorage.getItem(tokenKey(id));
    const publicKey = process.env.NEXT_PUBLIC_FINTOC_PUBLIC_KEY;
    if (!sessionToken || !publicKey) {
      setWidgetError("Falta el token de la sesión. Crea una sesión nueva desde el inicio.");
      return;
    }
    try {
      await loadFintocScript();
      widgetRef.current?.destroy();
      widgetRef.current = window.Fintoc!.create({
        product: "payments",
        publicKey,
        sessionToken,
        onSuccess: () => track("authorization_completed"),
        onExit: () => track("widget_closed"),
        onEvent: (event) => {
          const type = (event as { type?: string } | undefined)?.type;
          if (type && /error/i.test(type)) track("widget_error", { type });
        },
      });
      widgetRef.current.open();
      await track("widget_opened");
    } catch {
      setWidgetError("No se pudo cargar el widget de pago.");
      track("widget_error", { type: "widget_load" });
    }
  }

  if (notFound) {
    return <Page><PageHeader title="Sesión no encontrada">Revisa el enlace o crea una sesión nueva desde el inicio.</PageHeader></Page>;
  }
  if (!session) {
    return <Page><p className="text-muted">Cargando…</p></Page>;
  }

  const expired = session.status === "expired" || new Date(session.expires_at) < new Date();
  const terminal = ["paid", "finished", "failed", "rejected"].includes(session.status);
  const canPay = hasToken && !expired && !terminal;
  const statusKey = expired && !terminal ? "expired" : session.status;

  const events = [
    ...session.timeline.funnel.map((e) => ({ at: e.at, label: STEP_LABELS[e.step] ?? e.step, ok: e.step !== "widget_error" && e.step !== "widget_closed", kind: "funnel" })),
    ...session.timeline.webhooks.map((w) => ({
      at: w.at,
      label: `Webhook ${w.event_type} · ${w.signature_valid ? "firma válida" : "firma inválida"}`,
      ok: w.signature_valid,
      kind: "webhook",
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <Page>
      <PageHeader eyebrow="Sesión de prueba" title={STATUS_LABELS[statusKey] ?? statusKey}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[statusKey] ?? "neutral"}>{statusKey}</Badge>
          <span>{session.amount.toLocaleString("es-CL")} CLP de prueba</span>
          <span>·</span>
          <span>expira {fmt(session.expires_at)}</span>
        </div>
      </PageHeader>

      {canPay && (
        <Card>
          <CardTitle>Paso siguiente</CardTitle>
          <p className="mb-3 text-sm text-muted">
            Se abrirá el widget del proveedor. Elige cualquier banco y usa las credenciales de la pestaña “Casos a probar”.
          </p>
          <button type="button" onClick={pay} className={`${buttonPrimary} w-full py-3`}>
            Pagar con banco de prueba
          </button>
          {widgetError && <p className="mt-2 text-sm text-red-600">{widgetError}</p>}
        </Card>
      )}
      {!hasToken && !terminal && !expired && (
        <Card className="border-amber-300 bg-amber-50 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Esta sesión se creó en otro navegador. Para pagar, crea una nueva desde el inicio.
        </Card>
      )}

      <Card>
        <CardTitle hint={pollingStopped ? "actualización detenida" : "se actualiza cada 4 s"}>Línea de tiempo</CardTitle>
        <ol className="relative ml-2 flex flex-col gap-3 border-l border-line pl-5">
          {events.map((e, i) => (
            <li key={i} className="relative text-sm">
              <span
                className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-surface ${
                  e.ok ? (e.kind === "webhook" ? "bg-accent" : "bg-emerald-500") : "bg-red-500"
                }`}
              />
              <span className="mr-2 font-mono text-xs text-muted">{fmt(e.at)}</span>
              <span className={e.ok ? "" : "text-red-600"}>{e.label}</span>
            </li>
          ))}
        </ol>
        {pollingStopped && (
          <p className="mt-3 text-xs text-muted">Pasaron 15 minutos. Recarga la página para ver cambios.</p>
        )}
      </Card>

      {session.diagnostics.length > 0 && (
        <Card className="border-l-4 border-l-accent">
          <CardTitle hint="motor de reglas">Diagnóstico</CardTitle>
          {session.diagnostics.map((d, i) => (
            <div key={i} className="flex flex-col gap-1 text-sm">
              <div className="flex items-center gap-2">
                <Badge tone={d.severity === "crítica" ? "bad" : d.severity === "alta" ? "warn" : "neutral"}>{d.severity}</Badge>
                <code className="text-xs text-muted">{d.rule_id}</code>
              </div>
              <p className="font-medium">{d.explanation}</p>
              <p className="text-muted">Siguiente paso: {d.next_step}</p>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}
