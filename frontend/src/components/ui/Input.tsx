import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

interface FieldProps extends LabelHTMLAttributes<HTMLLabelElement> {
  label: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, hint, children, className = "", ...rest }: FieldProps) {
  return (
    <label className={`flex flex-col gap-2 ${className}`} {...rest}>
      <span className="text-[13px] font-[var(--font-cosmica)] text-iron">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-fog">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-snow border border-cloud rounded-[14px] px-4 py-3 text-[15px] font-[var(--font-cosmica)] text-obsidian placeholder:text-ash outline-none focus:border-iron transition-colors ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full bg-snow border border-cloud rounded-[14px] px-4 py-3 text-[15px] font-[var(--font-cosmica)] text-obsidian placeholder:text-ash outline-none focus:border-iron transition-colors resize-none ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full bg-snow border border-cloud rounded-[14px] px-4 py-3 text-[15px] font-[var(--font-cosmica)] text-obsidian outline-none focus:border-iron transition-colors ${props.className ?? ""}`}
    />
  );
}
