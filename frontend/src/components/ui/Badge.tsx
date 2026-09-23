import type { HTMLAttributes, ReactNode } from "react";

type Variant = "outline" | "filled" | "accent" | "dark";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  outline: "bg-transparent text-graphite border border-cloud",
  filled: "bg-iron text-[#fafafa] border border-transparent",
  accent: "bg-ember text-white border border-transparent",
  dark: "bg-obsidian text-snow border border-transparent",
};

export function Badge({ children, variant = "outline", className = "", ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[12px] px-2 py-1 text-[12px] font-[var(--font-cosmica)] leading-none whitespace-nowrap ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

/** Fully-round pill, used for the four transaction-lifecycle states. */
export function Pill({ children, variant = "outline", className = "", ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[10000px] px-3 py-1.5 text-[12px] font-[var(--font-cosmica)] leading-none whitespace-nowrap ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
