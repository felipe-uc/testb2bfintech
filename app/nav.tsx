"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Tienda" },
  { href: "/casos", label: "Cuentas de prueba" },
  { href: "/metrics", label: "Métricas" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-10 border-b border-line bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-1 px-4 py-3 sm:px-6">
        <Link href="/" className="mr-auto flex items-center gap-2.5" title="Volver a la tienda">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-accent font-display text-base font-semibold text-accent-ink">A</span>
          <span className="font-display text-lg font-medium tracking-tight">Tienda Aurora</span>
        </Link>
        {LINKS.map((l) => {
          const active = l.href === "/" ? pathname === "/" || pathname.startsWith("/s/") : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                active ? "bg-foreground text-background" : "text-muted hover:bg-line hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
