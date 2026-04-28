"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, FileText, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/presupuestos", label: "Presupuestos", icon: ClipboardList },
  { href: "/facturas", label: "Facturas", icon: FileText },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      role="navigation"
      aria-label="Navegación principal"
    >
      <div className="flex h-[4.25rem] items-center justify-evenly px-3 sm:px-4">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold tracking-wide transition-all",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-neutral-500 hover:bg-accent/5 hover:text-accent"
              )}
            >
              <Icon
                className="h-6 w-6 shrink-0"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="truncate px-0.5">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
