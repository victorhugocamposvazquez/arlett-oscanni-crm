"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export type Role = "admin" | "agente";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    const isAbortError = (error: unknown) => {
      if (!error) return false;
      if (error instanceof DOMException && error.name === "AbortError") return true;
      if (typeof error === "object" && "name" in error) {
        return (error as { name?: string }).name === "AbortError";
      }
      return false;
    };

    const getProfile = async (authUser: User): Promise<AuthUser | null> => {
      let profile: { role?: string } | null = null;
      try {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authUser.id)
          .single();
        profile = data as { role?: string } | null;
      } catch (error) {
        if (isAbortError(error)) {
          return null;
        }
      }

      if (profile?.role) {
        return {
          id: authUser.id,
          email: authUser.email ?? "",
          role: profile.role as Role,
        };
      }

      let error: unknown = null;
      try {
        const response = await supabase.from("profiles").insert({
          id: authUser.id,
          email: authUser.email,
          role: "agente",
        });
        error = response.error;
      } catch (insertError) {
        if (isAbortError(insertError)) {
          return null;
        }
        error = insertError;
      }

      if (!error) {
        return {
          id: authUser.id,
          email: authUser.email ?? "",
          role: "agente",
        };
      }

      return {
        id: authUser.id,
        email: authUser.email ?? "",
        role: "agente",
      };
    };

    const init = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          const profileUser = await getProfile(session.user);
          if (isMounted) setUser(profileUser);
        } else {
          if (isMounted) setUser(null);
        }
      } catch (error) {
        if (!isAbortError(error) && isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    init();
    const safetyTimeout = window.setTimeout(() => {
      if (isMounted) setIsLoading(false);
    }, 5000);

    const handleAuthChange = async (event: string, session: { user?: User } | null) => {
      try {
        if (event === "SIGNED_OUT" || !session?.user) {
          if (isMounted) {
            setUser(null);
            setIsLoading(false);
          }
          return;
        }
        const profileUser = await getProfile(session.user);
        if (isMounted) {
          setUser(profileUser);
          setIsLoading(false);
        }
      } catch (error) {
        if (!isAbortError(error) && isMounted) {
          setIsLoading(false);
        }
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      void handleAuthChange(event, session);
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user && isMounted) {
            getProfile(session.user).then((profileUser) => {
              if (isMounted && profileUser) setUser(profileUser);
            });
          }
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = React.useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = "/login";
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
