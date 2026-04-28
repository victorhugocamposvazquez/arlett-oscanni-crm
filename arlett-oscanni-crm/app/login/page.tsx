"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginFormValues } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: LoginFormValues) {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      setError(error.message === "Invalid login credentials" ? "Email o contraseña incorrectos" : error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0a0a0a] px-4 py-12 md:min-h-screen md:py-16">
      <Card className="w-full max-w-[420px] animate-[scaleIn_0.25s_ease-out] border border-[#c5a059]/35 bg-neutral-950 px-8 py-10 shadow-[0_4px_48px_rgba(197,160,89,0.12)] md:px-12 md:py-14" animate={false}>
        <CardHeader className="space-y-4 pb-8 text-center">
          <div className="flex justify-center">
            <Image
              src="/images/logo-arlett.png"
              alt="Arlett Beauty & Health"
              width={200}
              height={200}
              className="h-32 w-32 object-contain sm:h-36 sm:w-36"
              priority
            />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-[1.75rem] font-semibold tracking-tight text-white md:text-[2rem]">
              Acceso al CRM
            </CardTitle>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#c5a059]/90">
              Beauty &amp; Health
            </p>
          </div>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="space-y-2.5">
              <FloatingLabelInput
                id="email"
                type="email"
                label="Email"
                autoComplete="email"
                value={watch("email")}
                error={errors.email?.message}
                {...register("email")}
              />
            </div>
            <div className="space-y-2.5">
              <FloatingLabelInput
                id="password"
                type="password"
                label="Contraseña"
                autoComplete="current-password"
                value={watch("password")}
                error={errors.password?.message}
                {...register("password")}
              />
            </div>
            <Button
              type="submit"
              className="mt-2 h-12 w-full rounded-xl bg-[#c5a059] text-base font-semibold text-neutral-950 hover:bg-[#d4af37] focus-visible:ring-[#c5a059]/40"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
