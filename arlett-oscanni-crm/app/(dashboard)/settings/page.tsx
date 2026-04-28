"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { createUser } from "@/lib/actions/usuarios";
import { UserPlus, Building2 } from "lucide-react";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserConfirmPassword, setNewUserConfirmPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "agente">("agente");
  const [createUserMessage, setCreateUserMessage] = useState<string | null>(null);
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [createUserSaving, setCreateUserSaving] = useState(false);

  const onUpdatePassword = async () => {
    setError(null);
    setMessage(null);
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Contraseña actualizada correctamente.");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Ajustes", href: "/settings" }]}
        title="Ajustes de cuenta"
        description="Gestiona tu sesión, tu rol y la seguridad de acceso."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sesión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-neutral-500">Email</p>
            <p className="text-base font-medium">{user?.email ?? "—"}</p>
            <p className="mt-3 text-sm text-neutral-500">Rol</p>
            <p className="text-base font-medium capitalize">{user?.role ?? "—"}</p>
            <Button className="mt-4" variant="secondary" onClick={() => signOut()}>
              Cerrar sesión
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cambiar contraseña</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-amber-800">{message}</p>}
            <Button onClick={onUpdatePassword} disabled={saving}>
              {saving ? "Guardando..." : "Actualizar contraseña"}
            </Button>
          </CardContent>
        </Card>

        {user?.role === "admin" && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" strokeWidth={1.5} />
                Datos de empresa (facturación)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-neutral-600">
                Razón social, dirección, IBAN y número de cuenta que salen al imprimir facturas.
              </p>
              <Button className="mt-4" variant="secondary" asChild>
                <Link href="/settings/empresa">Editar datos de empresa</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {user?.role === "admin" && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" strokeWidth={1.5} />
                Crear usuario
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setCreateUserError(null);
                  setCreateUserMessage(null);
                  if (newUserPassword.length < 6) {
                    setCreateUserError("La contraseña debe tener al menos 6 caracteres.");
                    return;
                  }
                  if (newUserPassword !== newUserConfirmPassword) {
                    setCreateUserError("Las contraseñas no coinciden.");
                    return;
                  }
                  setCreateUserSaving(true);
                  const result = await createUser(newUserEmail, newUserPassword, newUserRole);
                  setCreateUserSaving(false);
                  if (result.success) {
                    setCreateUserMessage(result.message);
                    setNewUserEmail("");
                    setNewUserPassword("");
                    setNewUserConfirmPassword("");
                  } else {
                    setCreateUserError(result.error);
                  }
                }}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="new-user-email">Email</Label>
                  <Input
                    id="new-user-email"
                    type="email"
                    placeholder="usuario@ejemplo.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-user-password">Contraseña</Label>
                  <Input
                    id="new-user-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-user-confirm">Confirmar contraseña</Label>
                  <Input
                    id="new-user-confirm"
                    type="password"
                    placeholder="Repite la contraseña"
                    value={newUserConfirmPassword}
                    onChange={(e) => setNewUserConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-user-role">Rol</Label>
                  <select
                    id="new-user-role"
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as "admin" | "agente")}
                    className="flex h-10 w-full rounded-lg border border-border bg-white px-4 py-2 text-base"
                  >
                    <option value="agente">Agente</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-4">
                  {createUserError && <p className="text-sm text-red-600">{createUserError}</p>}
                  {createUserMessage && <p className="text-sm text-amber-800">{createUserMessage}</p>}
                  <Button type="submit" disabled={createUserSaving}>
                    {createUserSaving ? "Creando…" : "Crear usuario"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

