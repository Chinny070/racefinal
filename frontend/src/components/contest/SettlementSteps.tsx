import type { TxPhase } from "../../types/contract";

interface Step {
  key: string;
  label: string;
  description: string;
}

const STEPS: Step[] = [
  { key: "source", label: "Source locked", description: "Committed URL and terms are immutable." },
  { key: "submitted", label: "Settlement submitted", description: "Request sent to the network." },
  { key: "consensus", label: "Validator consensus", description: "Independent validators fetch and evaluate the source." },
  { key: "evidence", label: "Evidence verified", description: "Structured facts agreed across validators." },
  { key: "final", label: "Finalized result", description: "Deterministic outcome recorded on-chain." },
];

function stepState(stepKey: string, phase: TxPhase): "done" | "active" | "pending" {
  const order = ["source", "submitted", "consensus", "evidence", "final"];
  const idx = order.indexOf(stepKey);
  let current = 0;
  if (phase === "submitted") current = 1;
  else if (phase === "pending") current = 2;
  else if (phase === "finalized") current = 4;
  else if (phase === "failed") current = 2;

  if (phase === "failed" && stepKey === "evidence") return "pending";
  if (idx < current) return "done";
  if (idx === current) return "active";
  return "pending";
}

export function SettlementSteps({ phase }: { phase: TxPhase }) {
  return (
    <ol className="flex flex-col gap-0">
      {STEPS.map((step, i) => {
        const state = stepState(step.key, phase);
        return (
          <li key={step.key} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={`w-3 h-3 rounded-full border-2 ${
                  state === "done"
                    ? "bg-obsidian border-obsidian"
                    : state === "active"
                    ? "bg-ember border-ember animate-pulse"
                    : "bg-snow border-mist"
                }`}
              />
              {i < STEPS.length - 1 && (
                <span className={`w-px flex-1 min-h-[28px] ${state === "done" ? "bg-obsidian" : "bg-mist"}`} />
              )}
            </div>
            <div className="pb-7">
              <p
                className={`text-[15px] font-[var(--font-cosmica)] ${
                  state === "pending" ? "text-ash" : "text-obsidian"
                }`}
              >
                {step.label}
              </p>
              <p className="text-[13px] text-fog mt-0.5">{step.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
