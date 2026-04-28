import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-stone-200 bg-stone-100 text-stone-700",
        activo: "border-amber-300 bg-amber-100 text-amber-900",
        inactivo: "border-stone-200 bg-stone-100 text-stone-500",
        fallecido: "border-stone-300 bg-stone-200 text-stone-700",
        borrador: "border-amber-300 bg-amber-100 text-amber-800",
        emitida: "border-blue-300 bg-blue-100 text-blue-800",
        pagada: "border-amber-300 bg-amber-100 text-amber-900",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
