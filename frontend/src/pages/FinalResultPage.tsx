import { useParams, Link } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { useContest } from "../hooks/useContest";
import { weiToGen, formatUnixTime, truncateAddress } from "../lib/format";
import { CONTEST_STATUS, ZERO_ADDRESS } from "../lib/constants";

export function FinalResultPage() {
  const { id } = useParams();
  const contestId = id ? Number(id) : null;
  const { contest, loading } = useContest(contestId);

  if (loading) {
    return (
      <PageShell>
        <p className="text-[14px] text-fog">Loading result…</p>
      </PageShell>
    );
  }

  if (!contest || !contest.resolved) {
    return (
      <PageShell>
        <p className="text-[14px] text-ember">No finalized result for this contest yet.</p>
        {contest && (
          <Link to={`/contests/${contest.contest_id}/settle`} className="text-[13px] text-iron underline mt-3 inline-block">
            Go to settlement
          </Link>
        )}
      </PageShell>
    );
  }

  const isTie = contest.status === CONTEST_STATUS.TIE;
  const isRefund = contest.status === CONTEST_STATUS.REFUNDED;
  const winnerName =
    contest.status === CONTEST_STATUS.SETTLED_A
      ? contest.participant_a_id
      : contest.status === CONTEST_STATUS.SETTLED_B
      ? contest.participant_b_id
      : null;

  return (
    <PageShell>
      <div className="max-w-[640px] mx-auto text-center">
        <Badge variant="dark" className="mb-6">
          Finalized result
        </Badge>

        {winnerName && (
          <>
            <p className="text-[14px] text-fog">Contest #{contest.contest_id} · {contest.event_id}</p>
            <h1 className="text-[56px] leading-[1.28] font-[var(--font-cosmica)] font-semibold text-obsidian mt-3">
              {winnerName}
            </h1>
            <p className="text-[15px] text-steel mt-2">wins by independent validator consensus.</p>
          </>
        )}
        {isTie && (
          <>
            <p className="text-[14px] text-fog">Contest #{contest.contest_id} · {contest.event_id}</p>
            <h1 className="text-[56px] leading-[1.28] font-[var(--font-cosmica)] font-semibold text-obsidian mt-3">
              Official tie
            </h1>
            <p className="text-[15px] text-steel mt-2">Both stakes are refunded in full.</p>
          </>
        )}
        {isRefund && (
          <>
            <p className="text-[14px] text-fog">Contest #{contest.contest_id} · {contest.event_id}</p>
            <h1 className="text-[56px] leading-[1.28] font-[var(--font-cosmica)] font-semibold text-obsidian mt-3">
              Refunded
            </h1>
            <p className="text-[15px] text-steel mt-2">
              No valid settlement completed before the resolution deadline.
            </p>
          </>
        )}

        <Card className="text-left mt-10">
          <p className="text-[13px] font-[var(--font-cosmica)] text-fog mb-4">Evidence verified</p>
          {contest.result && (
            <div className="grid grid-cols-2 gap-5">
              <div>
                <p className="text-[12px] text-fog">{contest.participant_a_id}</p>
                <p className="text-[20px] font-[var(--font-cosmica)] font-semibold text-obsidian">
                  Rank {contest.result.participant_a_rank}
                </p>
              </div>
              <div>
                <p className="text-[12px] text-fog">{contest.participant_b_id}</p>
                <p className="text-[20px] font-[var(--font-cosmica)] font-semibold text-obsidian">
                  Rank {contest.result.participant_b_rank}
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-cloud">
            <div>
              <p className="text-[12px] text-fog">Winner</p>
              <p className="text-[14px] text-obsidian">
                {contest.winner === ZERO_ADDRESS ? "None — refunded" : truncateAddress(contest.winner)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[12px] text-fog">Pot</p>
              <p className="text-[14px] text-obsidian">{weiToGen(BigInt(contest.stake_wei) * 2n)} GEN</p>
            </div>
          </div>
          <a
            href={contest.canonical_source_url}
            target="_blank"
            rel="noreferrer"
            className="text-[13px] text-iron underline mt-4 inline-block"
          >
            Verified against committed source
          </a>
          {contest.result && (
            <p className="text-[12px] text-fog mt-1">
              Settled {formatUnixTime(contest.result.settled_at)}
            </p>
          )}
        </Card>

        <div className="flex items-center justify-center gap-3 mt-8">
          <Link to="/withdraw">
            <Button>Go to withdrawals</Button>
          </Link>
          <Link to="/contests">
            <Button variant="neutral">Back to explorer</Button>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
