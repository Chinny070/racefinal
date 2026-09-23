import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "neutral" | "pill";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 font-[var(--font-cosmica)] text-[14px] font-normal transition-opacity disabled:opacity-40 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary:
    "bg-obsidian text-snow rounded-[14px] px-4 py-3 border border-[#2c2e34] shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.5),0_1px_2px_rgba(0,0,0,0.14)] hover:opacity-90",
  ghost:
    "bg-snow text-iron rounded-[10000px] px-5 py-3 border border-iron hover:bg-paper",
  neutral:
    "bg-[#fafafa] text-graphite rounded-[14px] px-4 py-3 hover:bg-cloud",
  pill:
    "bg-obsidian text-snow rounded-[10000px] px-5 py-3 hover:opacity-90",
};

export function Button({ variant = "primary", className = "", children, ...rest }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
