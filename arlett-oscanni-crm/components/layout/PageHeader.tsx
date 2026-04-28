"use client";

import { type BreadcrumbItem, Breadcrumb } from "./Breadcrumb";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  breadcrumb?: BreadcrumbItem[];
  title: string;
  description?: string;
  descriptionClassName?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  breadcrumb,
  title,
  description,
  descriptionClassName,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("animate-[fadeIn_0.3s_ease-out]", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumb items={breadcrumb} className="mb-4" />
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2.2rem]">
            {title}
          </h1>
          {description && (
            <p className={cn("mt-2 max-w-2xl text-base text-neutral-600", descriptionClassName)}>
              {description}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
