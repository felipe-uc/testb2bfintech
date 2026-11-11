import Link from "next/link";
import type { ReactNode } from "react";

export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-8 sm:px-6 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
      {children}
    </main>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      {eyebrow && <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent">{eyebrow}</p>}
      <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
      {children && <div className="text-sm text-muted sm:text-base">{children}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(42,33,27,0.04)] sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-lg font-medium">{children}</h2>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function TestBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      Tienda de demostración · sin dinero real
    </span>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "accent";
const TONES: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
  ok: "bg-lime-100 text-lime-900 dark:bg-lime-950 dark:text-lime-200",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  bad: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
  accent: "bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

const BUTTON =
  "inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold tracking-tight transition disabled:cursor-not-allowed disabled:opacity-40";
export const buttonPrimary = `${BUTTON} bg-accent text-accent-ink shadow-[0_6px_16px_-8px_var(--accent)] hover:brightness-95`;
export const buttonSecondary = `${BUTTON} border border-line bg-surface text-foreground hover:border-accent hover:text-accent`;

export function LinkButton({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return (
    <Link href={href} className={secondary ? buttonSecondary : buttonPrimary}>
      {children}
    </Link>
  );
}

/** Fila de resumen de compra (producto, envío, total). */
export function SummaryRow({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-2 text-sm ${strong ? "border-t border-line pt-3 font-semibold" : "text-muted"}`}>
      <span>{label}</span>
      <span className={strong ? "text-base" : ""}>{value}</span>
    </div>
  );
}

export const clp = (n: number) => `$${n.toLocaleString("es-CL")}`;

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Tienda Aurora es una tienda ficticia de Activation Lab, un proyecto personal independiente.{" "}
          <strong className="font-medium">No afiliado a Fintoc.</strong>
        </p>
        <p className="flex gap-3">
          <span>Modo test, sin dinero real</span>
          <a href="https://github.com/felipe-uc/testb2bfintech" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
            Código en GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
