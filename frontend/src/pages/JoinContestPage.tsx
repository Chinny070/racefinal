import { useParams, Link } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { TxStateBadge } from "../components/contest/TxStateBadge";
import { useContest } from "../hooks/useContest";
import { useWallet } from "../state/WalletProvider";
import { useTxState } from "../hooks/useTxState";
import { joinContest } from "../lib/contract";
import { weiToGen, formatUnixTime } from "../lib/format";
import { CONTEST_STATUS } from "../lib/constants";

export function JoinContestPage() {
  const { id } = useParams();
  const contestId = id ? Number(id) : null;
  const { contest, loading, refresh } = useContest(contestId);
  const { address, client, connect, hasInjectedWallet } = useWallet();
  const { phase, error, run } = useTxState();

  if (loading) {
    return (
      <PageShell>
        <p className="text-[14px] text-fog">Loading contest…</p>
      </PageShell>
    );
  }

  if (!contest) {
    return (
      <PageShell>
        <p className="text-[14px] text-ember">Contest not found.</p>
      </PageShell>
    );
  }

  if (contest.status !== CONTEST_STATUS.CREATED) {
    return (
      <PageShell>
        <Card>
          <p className="text-[15px] text-obsidian">This contest is no longer open to join.</p>
          <Link to={`/contests/${contest.contest_id}`} className="text-[13px] text-iron underline mt-3 inline-block">
            View contest
          </Link>
        </Card>
      </PageShell>
    );
  }

  const busy = phase === "submitted" || phase === "pending";

  async function handleJoin() {
    if (!client || !contest) return;
    await run(async () => joinContest(client, contest.contest_id, BigInt(contest.stake_wei)), client);
    void refresh();
  }

  return (
    <PageShell>
      <div className="max-w-[560px] mx-auto">
        <Badge variant="outline" className="mb-4">
          Join contest #{contest.contest_id}
        </Badge>
        <h1 className="text-[32px] leading-[1.5] font-[var(--font-cosmica)] font-semibold text-obsidian">
          Take the opposite side of{" "}
          <span className="text-fog">{contest.participant_a_id}</span>.
        </h1>

        <Card className="mt-8 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-fog">Participant A</span>
            <span className="text-[14px] text-obsidian">{contest.participant_a_id}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-fog">Participant B (you)</span>
            <span className="text-[14px] text-obsidian">{contest.participant_b_id}</span>
          </div>
          <div className="flex items-center justify-between border-t border-cloud pt-4">
            <span className="text-[13px] text-fog">Source locked</span>
            <a href={contest.canonical_source_url} target="_blank" rel="noreferrer" className="text-[13px] text-obsidian underline">
              View source
            </a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-fog">Match closes</span>
            <span className="text-[14px] text-obsidian">{formatUnixTime(contest.match_close_time)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-cloud pt-4">
            <span className="text-[13px] text-fog">Required stake</span>
            <span className="text-[18px] font-[var(--font-cosmica)] font-semibold text-obsidian">
              {weiToGen(contest.stake_wei)} GEN
            </span>
          </div>

          {error && <p className="text-[13px] text-ember">{error}</p>}

          <div className="flex items-center gap-4">
            {!address ? (
              <Button onClick={connect} disabled={!hasInjectedWallet}>
                Connect wallet to join
              </Button>
            ) : (
              <Button onClick={handleJoin} disabled={busy}>
                {busy ? "Submitting…" : `Lock ${weiToGen(contest.stake_wei)} GEN and join`}
              </Button>
            )}
            <TxStateBadge phase={phase} />
          </div>

          {phase === "finalized" && (
            <div className="pt-2 border-t border-cloud">
              <p className="text-[13px] text-fog mb-2">Source is now locked. Terms are immutable.</p>
              <Link to={`/contests/${contest.contest_id}`}>
                <Button variant="neutral" className="w-full">
                  View contest
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
