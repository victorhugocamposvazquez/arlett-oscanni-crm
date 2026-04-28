"use client";

import { MobileNav } from "./MobileNav";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-foreground focus:px-4 focus:py-2 focus:text-background focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Saltar al contenido
      </a>
      <TopBar />
      <main id="main-content" className="mx-auto w-full max-w-[1600px] px-4 pb-24 pt-6 sm:px-6 sm:pb-10 sm:pt-8 lg:px-8 md:pb-10">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
