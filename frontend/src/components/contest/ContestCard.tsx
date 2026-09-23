import { Link } from "react-router-dom";
import { Card } from "../ui/Card";
import { StatusBadge } from "./StatusBadge";
import type { Contest } from "../../types/contract";
import { weiToGen, timeUntil, isPast } from "../../lib/format";
import { CONTEST_STATUS } from "../../lib/constants";

export function ContestCard({ contest }: { contest: Contest }) {
  const isOpen = contest.status === CONTEST_STATUS.CREATED;
  const isLocked = contest.status === CONTEST_STATUS.MATCHED;
  const settleReady = isLocked && isPast(contest.settle_after);

  return (
    <Link to={`/contests/${contest.contest_id}`}>
      <Card className="hover:border-iron transition-colors h-full flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[12px] font-[var(--font-cosmica)] text-fog">
            Contest #{contest.contest_id}
          </span>
          <StatusBadge status={contest.status} />
        </div>

        <div>
          <p className="text-[20px] font-[var(--font-cosmica)] font-semibold text-obsidian leading-snug">
            {contest.participant_a_id} <span className="text-ash font-normal">vs</span>{" "}
            {contest.participant_b_id}
          </p>
          <p className="text-[13px] text-fog mt-1">{contest.event_id}</p>
        </div>

        <div className="mt-auto flex items-end justify-between pt-4 border-t border-cloud">
          <div>
            <p className="text-[12px] text-fog">Stake</p>
            <p className="text-[15px] font-[var(--font-cosmica)] text-obsidian">
              {weiToGen(contest.stake_wei)} GEN
            </p>
          </div>
          <div className="text-right">
            {isOpen && (
              <>
                <p className="text-[12px] text-fog">Match closes</p>
                <p className="text-[13px] text-iron">{timeUntil(contest.match_close_time)}</p>
              </>
            )}
            {isLocked && !settleReady && (
              <>
                <p className="text-[12px] text-fog">Settles in</p>
                <p className="text-[13px] text-iron">{timeUntil(contest.settle_after)}</p>
              </>
            )}
            {isLocked && settleReady && <p className="text-[13px] text-ember">Ready to settle</p>}
          </div>
        </div>
      </Card>
    </Link>
  );
}
