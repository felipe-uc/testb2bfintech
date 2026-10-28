import Link from "next/link";
import type { ReactNode } from "react";

export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-8 sm:px-6 ${wide ? "max-w-4xl" : "max-w-lg"}`}>
      {children}
    </main>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      {eyebrow && <p className="text-xs font-medium uppercase tracking-wider text-muted">{eyebrow}</p>}
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {children && <div className="text-sm text-muted sm:text-base">{children}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-semibold">{children}</h2>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function TestBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Entorno de prueba · sin dinero real
    </span>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "accent";
const TONES: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  bad: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  accent: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

const BUTTON =
  "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
export const buttonPrimary = `${BUTTON} bg-accent text-accent-ink hover:opacity-90`;
export const buttonSecondary = `${BUTTON} border border-line bg-surface hover:border-stone-400 dark:hover:border-stone-500`;

export function LinkButton({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return (
    <Link href={href} className={secondary ? buttonSecondary : buttonPrimary}>
      {children}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-1 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Activation Lab · proyecto personal independiente. <strong className="font-medium">No afiliado a Fintoc.</strong>
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
