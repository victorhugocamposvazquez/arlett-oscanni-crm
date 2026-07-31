import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Guarda de las rutas de SMS del backoffice: devuelve la respuesta de rechazo, o
 * null si quien llama es un administrador autenticado.
 */
export async function denyIfNotAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  return null;
}
