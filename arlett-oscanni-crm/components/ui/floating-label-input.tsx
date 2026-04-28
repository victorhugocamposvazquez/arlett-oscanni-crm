"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface FloatingLabelInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "placeholder"> {
  label: string;
  value?: string;
  error?: string;
}

const FloatingLabelInput = React.forwardRef<
  HTMLInputElement,
  FloatingLabelInputProps
>(
  (
    { label, value = "", error, className, id: propId, onFocus, onBlur, ...props },
    ref
  ) => {
    const [focused, setFocused] = React.useState(false);
    const id = React.useId();
    const inputId = propId ?? id;

    const hasValue = (value ?? "").length > 0;
    const floating = focused || hasValue;

    return (
      <div className="relative w-full">
        <input
          ref={ref}
          id={inputId}
          value={value}
          className={cn(
            "peer flex h-16 w-full rounded-xl bg-white px-4 pt-7 pb-4 text-base transition-shadow duration-200 ease-out",
            "border-0 outline-none",
            "shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
            "placeholder:text-transparent",
            "focus:shadow-[0_2px_8px_rgba(0,0,0,0.08)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "shadow-[0_1px_2px_rgba(220,38,38,0.15)]",
            error && "focus:shadow-[0_2px_8px_rgba(220,38,38,0.2)]",
            className
          )}
          placeholder={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        <label
          htmlFor={inputId}
          className={cn(
            "pointer-events-none absolute left-4 text-neutral-500 transition-all duration-200 ease-out",
            floating
              ? "top-3.5 text-xs font-medium text-neutral-600"
              : "top-1/2 -translate-y-1/2 text-base text-neutral-400"
          )}
        >
          {label}
        </label>
        {error && (
          <p className="mt-1.5 text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  }
);

FloatingLabelInput.displayName = "FloatingLabelInput";

export { FloatingLabelInput };
