import { Pill } from "../ui/Badge";
import type { TxPhase } from "../../types/contract";

const CONFIG: Record<Exclude<TxPhase, "idle">, { label: string; variant: "outline" | "accent" | "dark" | "filled" }> = {
  submitted: { label: "Submitted", variant: "outline" },
  pending: { label: "Pending consensus", variant: "accent" },
  finalized: { label: "Finalized", variant: "dark" },
  failed: { label: "Failed", variant: "filled" },
};

export function TxStateBadge({ phase }: { phase: TxPhase }) {
  if (phase === "idle") return null;
  const cfg = CONFIG[phase];
  return (
    <Pill variant={cfg.variant}>
      {phase === "pending" && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden />
      )}
      {cfg.label}
    </Pill>
  );
}
