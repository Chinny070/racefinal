import { useEffect, useState } from "react";
import { PageShell } from "../components/layout/PageShell";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { TxStateBadge } from "../components/contest/TxStateBadge";
import { useWallet } from "../state/WalletProvider";
import { useTxState } from "../hooks/useTxState";
import { readWithdrawable, withdraw as withdrawCall } from "../lib/contract";
import { weiToGen } from "../lib/format";

export function WithdrawalPage() {
  const { address, client, connect, hasInjectedWallet } = useWallet();
  const { phase, error, run, reset } = useTxState();
  const [amount, setAmount] = useState<bigint | null>(null);
  const [checking, setChecking] = useState(false);

  async function refreshAmount() {
    if (!address) return;
    setChecking(true);
    try {
      const w = await readWithdrawable(address);
      setAmount(w);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void refreshAmount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const busy = phase === "submitted" || phase === "pending";

  async function handleWithdraw() {
    if (!client) return;
    await run(async () => withdrawCall(client), client);
    void refreshAmount();
  }

  return (
    <PageShell>
      <div className="max-w-[560px] mx-auto">
        <Badge variant="outline" className="mb-4">
          Withdrawals
        </Badge>
        <h1 className="text-[40px] leading-[1.28] font-[var(--font-cosmica)] font-semibold text-obsidian">
          Claim settled funds.
        </h1>
        <p className="text-[14px] text-fog mt-3 mb-10">
          Winnings, ties, and refunds accumulate here as a pull balance. Withdraw
          any time — nothing is sent automatically.
        </p>

        <Card>
          {!address ? (
            <div className="text-center py-6">
              <p className="text-[14px] text-fog mb-4">Connect a wallet to check your balance.</p>
              <Button onClick={connect} disabled={!hasInjectedWallet}>
                Connect wallet
              </Button>
            </div>
          ) : (
            <>
              <p className="text-[13px] text-fog mb-1">Withdrawable balance</p>
              <p className="text-[56px] leading-[1.28] font-[var(--font-cosmica)] font-semibold text-obsidian">
                {checking ? "…" : amount !== null ? weiToGen(amount) : "0"}{" "}
                <span className="text-[24px] text-fog">GEN</span>
              </p>

              {error && <p className="text-[13px] text-ember mt-4">{error}</p>}

              <div className="flex items-center gap-4 mt-6">
                <Button onClick={handleWithdraw} disabled={busy || !amount || amount === 0n}>
                  {busy ? "Withdrawing…" : "Withdraw"}
                </Button>
                <TxStateBadge phase={phase} />
                {phase === "failed" && (
                  <button onClick={reset} className="text-[13px] text-iron underline">
                    Retry
                  </button>
                )}
              </div>

              {phase === "finalized" && (
                <p className="text-[13px] text-fog mt-4 pt-4 border-t border-cloud">
                  Funds sent to your wallet. Balance refreshed above.
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
