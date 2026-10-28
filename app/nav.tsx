"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Probar el flujo" },
  { href: "/casos", label: "Casos a probar" },
  { href: "/metrics", label: "Métricas" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-10 border-b border-line bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-1 px-4 py-2.5 sm:px-6">
        <Link href="/" className="mr-auto flex items-center gap-2 font-semibold" title="Nueva sesión limpia">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-xs font-bold text-accent-ink">AL</span>
          <span className="hidden sm:inline">Activation Lab</span>
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
