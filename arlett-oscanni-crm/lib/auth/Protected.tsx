"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function Protected({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setRedirecting(true);
      router.replace("/login?redirect=" + encodeURIComponent(pathname ?? "/"));
    }
  }, [user, isLoading, router, pathname]);

  const showLoader = isLoading || (redirecting && !user);

  if (showLoader || !user) {
    return (
      <div className="flex min-h-dvh min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-foreground" />
          <p className="text-sm text-neutral-500">
            {redirecting ? "Redirigiendo…" : "Cargando…"}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
