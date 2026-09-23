import { useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { TxStateBadge } from "../components/contest/TxStateBadge";
import { SettlementSteps } from "../components/contest/SettlementSteps";
import { useContest } from "../hooks/useContest";
import { useWallet } from "../state/WalletProvider";
import { useTxState } from "../hooks/useTxState";
import { settleContest, refundAfterDeadline } from "../lib/contract";
import { isPast } from "../lib/format";
import { CONTEST_STATUS } from "../lib/constants";

export function SettlementProgressPage() {
  const { id } = useParams();
  const contestId = id ? Number(id) : null;
  const { contest, loading, refresh } = useContest(contestId);
  const { client, address, connect, error: walletError } = useWallet();
  const { phase, error, run, reset } = useTxState();
  const navigate = useNavigate();

  useEffect(() => {
    if (phase === "finalized" && contest) {
      const t = setTimeout(() => navigate(`/contests/${contest.contest_id}/result`), 1200);
      return () => clearTimeout(t);
    }
  }, [phase, contest, navigate]);

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

  const refundReady = contest.status === CONTEST_STATUS.MATCHED && isPast(contest.resolution_deadline);
  const settleReady = contest.status === CONTEST_STATUS.MATCHED && isPast(contest.settle_after) && !refundReady;
  const busy = phase === "submitted" || phase === "pending";

  async function handleSettle() {
    if (!client || !contest) return;
    await run(async () => settleContest(client, contest.contest_id), client);
    void refresh();
  }

  async function handleRefund() {
    if (!client || !contest) return;
    await run(async () => refundAfterDeadline(client, contest.contest_id), client);
    void refresh();
  }

  return (
    <PageShell>
      <div className="max-w-[640px] mx-auto">
        <Badge variant="outline" className="mb-4">
          Contest #{contest.contest_id}
        </Badge>
        <h1 className="text-[32px] leading-[1.5] font-[var(--font-cosmica)] font-semibold text-obsidian">
          {refundReady ? "Claim refund" : "Settlement"}
        </h1>
        <p className="text-[14px] text-fog mt-2 max-w-md">
          {refundReady
            ? "The resolution deadline passed without a valid settlement. Either side may trigger a full refund."
            : "Validators independently fetch the committed source and reach consensus on the result. No one — including you — supplies the outcome."}
        </p>

        <Card className="mt-8">
          {!refundReady && <SettlementSteps phase={phase} />}

          {contest.resolved && (
            <div className="border border-cloud rounded-[14px] px-4 py-3 text-[13px] text-fog mb-6">
              This contest is already resolved.{" "}
              <Link to={`/contests/${contest.contest_id}/result`} className="text-obsidian underline">
                View result
              </Link>
            </div>
          )}

          {error && (
            <div className="border border-cloud rounded-[14px] px-4 py-3 mb-6">
              <p className="text-[13px] text-ember">{error}</p>
              <p className="text-[12px] text-fog mt-1">
                No funds moved. The contest remains locked and can be retried.
              </p>
            </div>
          )}
          {walletError && !address && <p className="text-[13px] text-ember mb-6">{walletError}</p>}

          <div className="flex items-center gap-4">
            {!address ? (
              <Button onClick={connect}>Connect wallet</Button>
            ) : contest.resolved ? (
              <Link to={`/contests/${contest.contest_id}/result`}>
                <Button variant="neutral">View result</Button>
              </Link>
            ) : refundReady ? (
              <Button onClick={handleRefund} disabled={busy}>
                {busy ? "Submitting…" : "Claim refund"}
              </Button>
            ) : settleReady ? (
              <Button onClick={handleSettle} disabled={busy}>
                {busy ? "Settling…" : "Settle contest"}
              </Button>
            ) : (
              <Badge variant="outline">Not settleable yet</Badge>
            )}
            <TxStateBadge phase={phase} />
            {phase === "failed" && (
              <button onClick={reset} className="text-[13px] text-iron underline">
                Retry
              </button>
            )}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
