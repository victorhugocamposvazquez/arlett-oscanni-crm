"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Home,
  Users,
  FileText,
  ClipboardList,
  LogOut,
  KeyRound,
  Settings,
  Building2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { Sheet } from "@/components/ui/sheet";

const navItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/presupuestos", label: "Presupuestos", icon: ClipboardList },
  { href: "/facturas", label: "Facturas", icon: FileText },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

export function TopBar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const onUpdatePassword = async () => {
    setPasswordError(null);
    setPasswordMessage(null);
    if (password.length < 6) {
      setPasswordError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Las contraseñas no coinciden.");
      return;
    }
    setPasswordSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPasswordSaving(false);
    if (updateError) {
      setPasswordError(updateError.message);
      return;
    }
    setPasswordMessage("Contraseña actualizada correctamente.");
    setPassword("");
    setConfirmPassword("");
  };

  const initials = useMemo(() => {
    const source = user?.email?.split("@")[0] ?? "U";
    const parts = source.split(/[._-]/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }, [user?.email]);

  return (
    <>
      <header
        className="sticky top-0 z-40 border-b border-border/80 bg-white/95 pt-safe-area-top backdrop-blur"
        role="banner"
      >
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2"
            aria-label="Arlett — Inicio"
          >
            <Image
              src="/images/logo-arlett.png"
              alt="Arlett Beauty & Health"
              width={120}
              height={120}
              className="h-9 w-9 object-contain sm:h-10 sm:w-10"
              priority
            />
          </Link>

          <nav
            className="hidden items-center gap-1 rounded-xl border border-border bg-neutral-50/70 p-1 md:flex"
            role="navigation"
            aria-label="Navegación principal"
          >
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive =
                pathname === href ||
                (href !== "/" && href !== "/settings" && pathname.startsWith(href)) ||
                (href === "/settings" && pathname.startsWith("/settings"));
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-neutral-600 hover:bg-accent/5 hover:text-accent"
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          {user && (
            <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/settings"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-accent md:hidden"
              aria-label="Ajustes"
            >
              <Settings className="h-5 w-5" strokeWidth={1.5} />
            </Link>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-white px-2 py-1.5 shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition-colors hover:bg-neutral-50 active:scale-[0.98]"
              aria-label="Abrir menú de sesión"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {initials}
              </span>
              <span className="hidden pr-1 text-xs font-semibold uppercase tracking-wide text-neutral-600 sm:inline">
                {user.role === "admin" ? "Admin" : "Agente"}
              </span>
            </button>
            </div>
          )}
        </div>
      </header>

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setPassword("");
            setConfirmPassword("");
            setPasswordMessage(null);
            setPasswordError(null);
          }
        }}
        fullScreenOnMobile
        showCloseButton
      >
        <div className="px-4 pb-24 pt-4 md:pb-8">
          <h2 className="mb-6 text-xl font-semibold">Ajustes</h2>
          <div className="mb-6 rounded-2xl bg-neutral-50 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Sesión iniciada
            </p>
            <p className="mt-1 truncate text-base font-semibold text-foreground">
              {user?.email ?? "—"}
            </p>
            <p className="mt-0.5 text-sm capitalize text-neutral-500">
              {user?.role === "admin" ? "Administrador" : "Agente"}
            </p>
          </div>

          <div className="mb-8 rounded-2xl border border-border bg-white p-4">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <KeyRound className="h-4 w-4" strokeWidth={1.5} />
              Cambiar contraseña
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sheet-new-password">Nueva contraseña</Label>
                <Input
                  id="sheet-new-password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sheet-confirm-password">Confirmar contraseña</Label>
                <Input
                  id="sheet-confirm-password"
                  type="password"
                  placeholder="Repite la contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
              {passwordMessage && <p className="text-sm text-amber-800">{passwordMessage}</p>}
              <Button onClick={onUpdatePassword} disabled={passwordSaving} size="sm">
                {passwordSaving ? "Guardando…" : "Actualizar contraseña"}
              </Button>
            </div>
          </div>

          <Link
            href="/settings"
            onClick={() => setSheetOpen(false)}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-medium text-foreground transition-colors hover:bg-neutral-50"
          >
            <Settings className="h-5 w-5 shrink-0 text-neutral-500" strokeWidth={1.5} />
            <span>Ajustes de cuenta</span>
          </Link>

          {user?.role === "admin" && (
            <Link
              href="/settings/empresa"
              onClick={() => setSheetOpen(false)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-medium text-foreground transition-colors hover:bg-neutral-50"
            >
              <Building2 className="h-5 w-5 shrink-0 text-neutral-500" strokeWidth={1.5} />
              <span>Datos de empresa (facturación)</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => {
              signOut();
              setSheetOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-5 w-5" strokeWidth={1.5} />
            Cerrar sesión
          </button>
        </div>
      </Sheet>
    </>
  );
}
