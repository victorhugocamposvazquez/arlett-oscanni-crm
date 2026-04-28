"use client";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function FacturaListSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-[fadeIn_0.3s_ease-out]" aria-busy="true" aria-live="polite">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} animate={false} className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
