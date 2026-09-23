import { useParams, Link } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { Card, SubtleCard } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { StatusBadge } from "../components/contest/StatusBadge";
import { useContest } from "../hooks/useContest";
import { weiToGen, formatUnixTime, isPast, truncateAddress } from "../lib/format";
import { CONTEST_STATUS, ZERO_ADDRESS } from "../lib/constants";

export function ContestDetailPage() {
  const { id } = useParams();
  const contestId = id ? Number(id) : null;
  const { contest, loading, error } = useContest(contestId);

  if (loading) {
    return (
      <PageShell>
        <p className="text-[14px] text-fog">Loading contest…</p>
      </PageShell>
    );
  }

  if (error || !contest) {
    return (
      <PageShell>
        <p className="text-[14px] text-ember">{error ?? "Contest not found."}</p>
        <Link to="/contests" className="text-[13px] text-iron underline mt-4 inline-block">
          Back to explorer
        </Link>
      </PageShell>
    );
  }

  const isOpen = contest.status === CONTEST_STATUS.CREATED;
  const isLocked = contest.status === CONTEST_STATUS.MATCHED;
  const settleReady = isLocked && isPast(contest.settle_after);
  const refundReady = isLocked && isPast(contest.resolution_deadline);

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-6">
        <Link to="/contests" className="text-[13px] text-fog hover:text-obsidian">
          ← All contests
        </Link>
        <StatusBadge status={contest.status} />
      </div>

      <h1 className="text-[40px] leading-[1.28] font-[var(--font-cosmica)] font-semibold text-obsidian">
        {contest.participant_a_id} <span className="text-ash font-normal">vs</span> {contest.participant_b_id}
      </h1>
      <p className="text-[14px] text-fog mt-2">{contest.event_id}</p>

      <div className="grid md:grid-cols-[1.4fr_1fr] gap-6 mt-10">
        <div className="flex flex-col gap-6">
          <Card>
            <p className="text-[13px] font-[var(--font-cosmica)] text-fog mb-4">Committed terms</p>
            <dl className="flex flex-col gap-4">
              <Row label="Canonical source">
                <a
                  href={contest.canonical_source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[14px] text-obsidian underline break-all"
                >
                  {contest.canonical_source_url}
                </a>
              </Row>
              <Row label="Retrieval method">
                <span className="text-[14px] text-obsidian capitalize">{contest.retrieval_method}</span>
              </Row>
              <Row label="Stake per side">
                <span className="text-[14px] text-obsidian">{weiToGen(contest.stake_wei)} GEN</span>
              </Row>
              <Row label="Match closes">
                <span className="text-[14px] text-obsidian">{formatUnixTime(contest.match_close_time)}</span>
              </Row>
              <Row label="Settles after">
                <span className="text-[14px] text-obsidian">{formatUnixTime(contest.settle_after)}</span>
              </Row>
              <Row label="Refund deadline">
                <span className="text-[14px] text-obsidian">{formatUnixTime(contest.resolution_deadline)}</span>
              </Row>
            </dl>
          </Card>

          <Card>
            <p className="text-[13px] font-[var(--font-cosmica)] text-fog mb-4">Participants</p>
            <div className="flex flex-col gap-3">
              <PartyRow label="A" name={contest.participant_a_id} address={contest.creator} won={contest.winner === contest.creator && contest.winner !== ZERO_ADDRESS} />
              <PartyRow
                label="B"
                name={contest.participant_b_id}
                address={contest.counterparty === ZERO_ADDRESS ? null : contest.counterparty}
                won={contest.winner === contest.counterparty && contest.winner !== ZERO_ADDRESS}
              />
            </div>
          </Card>

          {contest.has_result_record && contest.result && (
            <Card>
              <p className="text-[13px] font-[var(--font-cosmica)] text-fog mb-4">Evidence verified by validator consensus</p>
              <div className="grid grid-cols-2 gap-4">
                <Fact label="Source usable" ok={contest.result.source_ok} />
                <Fact label="Event match" ok={contest.result.event_match} />
                <Fact label="Result final" ok={contest.result.is_final} />
                <Fact label="Both participants found" ok={contest.result.participant_a_found && contest.result.participant_b_found} />
                <div>
                  <p className="text-[12px] text-fog">{contest.participant_a_id} rank</p>
                  <p className="text-[15px] font-[var(--font-cosmica)] text-obsidian">{contest.result.participant_a_rank}</p>
                </div>
                <div>
                  <p className="text-[12px] text-fog">{contest.participant_b_id} rank</p>
                  <p className="text-[15px] font-[var(--font-cosmica)] text-obsidian">{contest.result.participant_b_rank}</p>
                </div>
              </div>
              <p className="text-[12px] text-fog mt-4">
                Settled {formatUnixTime(contest.result.settled_at)}
              </p>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <SubtleCard>
            <p className="text-[13px] font-[var(--font-cosmica)] text-fog mb-4">Actions</p>
            <div className="flex flex-col gap-3">
              {isOpen && (
                <Link to={`/contests/${contest.contest_id}/join`}>
                  <Button className="w-full">Join this contest</Button>
                </Link>
              )}
              {isLocked && settleReady && (
                <Link to={`/contests/${contest.contest_id}/settle`}>
                  <Button className="w-full">Settle now</Button>
                </Link>
              )}
              {isLocked && !settleReady && (
                <Badge variant="outline" className="w-full justify-center py-3">
                  Settlement opens {formatUnixTime(contest.settle_after)}
                </Badge>
              )}
              {refundReady && (
                <Link to={`/contests/${contest.contest_id}/settle`}>
                  <Button variant="neutral" className="w-full">
                    Claim refund
                  </Button>
                </Link>
              )}
              {contest.resolved && (
                <Link to={`/contests/${contest.contest_id}/result`}>
                  <Button variant="neutral" className="w-full">
                    View final result
                  </Button>
                </Link>
              )}
              <Link to="/withdraw">
                <Button variant="ghost" className="w-full">
                  Go to withdrawals
                </Button>
              </Link>
            </div>
          </SubtleCard>

          <div className="text-[12px] text-fog leading-relaxed px-1">
            Verified against committed source. RACE//FINAL does not trust either
            participant, a screenshot, or a result submitter — it relies on the
            integrity of this precommitted public source and independent
            validator consensus.
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[12px] text-fog">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function PartyRow({ label, name, address, won }: { label: string; name: string; address: string | null; won: boolean }) {
  return (
    <div className="flex items-center justify-between border border-cloud rounded-[14px] px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="w-6 h-6 rounded-full bg-paper border border-cloud flex items-center justify-center text-[11px] text-iron">
          {label}
        </span>
        <div>
          <p className="text-[14px] text-obsidian">{name}</p>
          <p className="text-[12px] text-fog">{address ? truncateAddress(address) : "Awaiting participant"}</p>
        </div>
      </div>
      {won && <Badge variant="accent">Winner</Badge>}
    </div>
  );
}

function Fact({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div>
      <p className="text-[12px] text-fog">{label}</p>
      <p className={`text-[14px] font-[var(--font-cosmica)] ${ok ? "text-obsidian" : "text-ember"}`}>
        {ok ? "Confirmed" : "Not confirmed"}
      </p>
    </div>
  );
}
