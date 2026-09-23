import { Link } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { StatBlock } from "../components/ui/StatBlock";
import { useContestList } from "../hooks/useContestList";
import { weiToGen } from "../lib/format";
import { CONTEST_STATUS } from "../lib/constants";

export function LandingPage() {
  const { contests, loading } = useContestList();

  const totalStaked = contests.reduce((sum, c) => sum + BigInt(c.stake_wei) * (c.status >= CONTEST_STATUS.MATCHED ? 2n : 1n), 0n);
  const finalized = contests.filter((c) => c.resolved).length;

  return (
    <PageShell>
      <section className="grid md:grid-cols-[1.3fr_1fr] gap-10 items-center py-10">
        <div>
          <Badge variant="outline" className="mb-6">
            Live on StudioNet
          </Badge>
          <h1 className="text-[64px] leading-[1.12] font-[var(--font-cosmica)] font-semibold text-obsidian tracking-tight">
            Truth settlement
            <br />
            for public competitions.
          </h1>
          <p className="text-[15px] text-steel mt-6 max-w-md leading-relaxed">
            Two participants commit a public results source before the outcome is
            known. When the event ends, independent validators fetch the source,
            verify the evidence, and settle the stake — deterministically, with
            no admin override and no oracle.
          </p>
          <div className="flex items-center gap-3 mt-8">
            <Link to="/contests/new">
              <Button variant="primary">Create a contest</Button>
            </Link>
            <Link to="/contests">
              <Button variant="neutral">Browse contests</Button>
            </Link>
          </div>
        </div>

        <Card className="flex flex-col gap-6">
          <p className="text-[13px] font-[var(--font-cosmica)] text-fog">Protocol, in four steps</p>
          {[
            ["Source locked", "Both sides commit the exact results URL and terms before the event."],
            ["Validator consensus", "Independent validators fetch and evaluate the source at settlement."],
            ["Evidence verified", "Structured facts must agree across validators before anything moves."],
            ["Finalized result", "Deterministic rank comparison decides the winner — never an LLM."],
          ].map(([title, desc], i) => (
            <div key={title} className="flex gap-4">
              <span className="text-[13px] font-[var(--font-cosmica)] text-ash w-5">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="text-[15px] font-[var(--font-cosmica)] text-obsidian">{title}</p>
                <p className="text-[13px] text-fog mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section className="flex flex-wrap gap-12 py-16 border-t border-cloud mt-8">
        <StatBlock value={loading ? "—" : String(contests.length)} label="contests created" />
        <StatBlock value={loading ? "—" : String(finalized)} label="finalized" />
        <StatBlock value={loading ? "—" : `${weiToGen(totalStaked)}`} label="GEN in escrow" />
      </section>

      <section className="py-8">
        <p className="text-[13px] font-[var(--font-cosmica)] text-fog mb-4">
          RACE//FINAL is not a prediction market. It settles one thing: did the
          committed public result actually occur, according to the source both
          sides agreed to before the outcome was known.
        </p>
      </section>
    </PageShell>
  );
}
