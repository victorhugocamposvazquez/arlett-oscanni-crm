"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface FabProps {
  href: string;
  label: string;
  className?: string;
}

export function Fab({ href, label, className }: FabProps) {
  return (
    <Link
      href={href}
      className={cn(
        "fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-[0_12px_24px_rgba(184,134,11,0.3)] transition-transform hover:opacity-95 active:scale-95 md:hidden [&_svg]:h-6 [&_svg]:w-6",
        "animate-[fadeIn_0.2s_ease-out]",
        className
      )}
      aria-label={label}
    >
      <Plus strokeWidth={1.5} aria-hidden />
    </Link>
  );
}
