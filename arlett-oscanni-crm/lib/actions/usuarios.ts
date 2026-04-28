"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CreateUserResult =
  | { success: true; message: string }
  | { success: false; error: string };

export async function createUser(
  email: string,
  password: string,
  role: "admin" | "agente"
): Promise<CreateUserResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
      return { success: false, error: "Debes iniciar sesión para crear usuarios." };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", currentUser.id)
      .single();

    if (profile?.role !== "admin") {
      return { success: false, error: "Solo los administradores pueden crear usuarios." };
    }

    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed) {
      return { success: false, error: "El email es obligatorio." };
    }
    if (password.length < 6) {
      return { success: false, error: "La contraseña debe tener al menos 6 caracteres." };
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return {
        success: false,
        error: "Falta SUPABASE_SERVICE_ROLE_KEY. Añádela en Vercel → Settings → Environment Variables y redeploy.",
      };
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: emailTrimmed,
      password,
      email_confirm: true,
      user_metadata: { role },
    });

    if (error) {
      if (error.message.includes("already been registered") || error.message.includes("already exists")) {
        return { success: false, error: "Ya existe un usuario con ese email." };
      }
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: "No se recibió el usuario creado." };
    }

    // El trigger handle_new_user crea el perfil; upsert por si el rol no se propagó
    const { error: upsertError } = await admin.from("profiles").upsert(
      {
        id: data.user.id,
        email: emailTrimmed,
        role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (upsertError) {
      console.error("createUser profiles upsert:", upsertError);
      // El usuario ya existe en auth; el perfil puede haberse creado por el trigger
      return {
        success: true,
        message: `Usuario ${emailTrimmed} creado. Revisa en Supabase → Authentication si aparece.`,
      };
    }

    return {
      success: true,
      message: `Usuario ${emailTrimmed} creado correctamente como ${role}.`,
    };
  } catch (err) {
    console.error("createUser error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al crear el usuario.",
    };
  }
}
