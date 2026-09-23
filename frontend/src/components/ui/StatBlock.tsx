interface StatBlockProps {
  value: string;
  label: string;
}

export function StatBlock({ value, label }: StatBlockProps) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[40px] leading-[1.28] font-[var(--font-cosmica)] font-semibold text-obsidian">
        {value}
      </span>
      <span className="text-[14px] font-[var(--font-cosmica)] text-steel">{label}</span>
    </div>
  );
}
