import { useCallback, useRef, useState } from "react";
import type { GenLayerClient } from "genlayer-js/types";
import { transactionsStatusNumberToName } from "genlayer-js/types";
import type { studionet } from "../lib/genlayerClient";
import { getReadClient } from "../lib/genlayerClient";
import type { TxPhase } from "../types/contract";

type Client = GenLayerClient<typeof studionet>;

const PENDING_STATUSES = new Set(["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED"]);
const FAILED_STATUSES = new Set(["UNDETERMINED"]);

interface TxStateResult {
  phase: TxPhase;
  txHash: `0x${string}` | null;
  error: string | null;
  run: (action: () => Promise<`0x${string}`>, client: Client) => Promise<void>;
  reset: () => void;
}

/**
 * Drives the four-phase transaction lifecycle the design spec requires:
 * Submitted -> Pending consensus -> Finalized / Failed.
 *
 * Per the GenLayerJS docs: once writeContract returns a hash, a client
 * timeout is not evidence of failure -- this hook keeps polling the same
 * hash rather than assuming failure or letting the caller retry blindly.
 */
export function useTxState(): TxStateResult {
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    setPhase("idle");
    setTxHash(null);
    setError(null);
  }, []);

  const run = useCallback(async (action: () => Promise<`0x${string}`>, client: Client) => {
    cancelledRef.current = false;
    setError(null);
    setPhase("submitted");
    let hash: `0x${string}`;
    try {
      hash = await action();
      setTxHash(hash);
    } catch (e) {
      setPhase("failed");
      setError(extractRevertReason(e));
      return;
    }

    setPhase("pending");
    try {
      // A write is wallet-backed, but receipt polling must use the public
      // StudioNet RPC. Some injected wallets accept the write then reject or
      // intermittently fail GenLayer's custom transaction-read RPC methods.
      const readClient = getReadClient();
      let attempts = 0;
      while (!cancelledRef.current && attempts < 120) {
        attempts += 1;
        let tx: Awaited<ReturnType<Client["getTransaction"]>>;
        try {
          tx = await readClient.getTransaction({
            hash: hash as unknown as Parameters<Client["getTransaction"]>[0]["hash"],
          });
        } catch {
          // Submission already returned a tx hash. A temporary RPC/network
          // failure is not evidence the on-chain transaction failed; keep
          // the UI pending and retry the same immutable hash.
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }
        const rawStatus = (tx as { status?: unknown })?.status;
        // The RPC returns status as a numeric code; the SDK's enum values
        // are the string names. Normalize numeric codes via the SDK's own
        // lookup table so "1" (PENDING) isn't mistaken for an unknown
        // terminal status and marked failed while still genuinely pending.
        const statusName =
          typeof rawStatus === "number" || (typeof rawStatus === "string" && /^\d+$/.test(rawStatus))
            ? String(transactionsStatusNumberToName[String(rawStatus) as keyof typeof transactionsStatusNumberToName] ?? rawStatus)
            : String(rawStatus ?? "");
        if (statusName === "FINALIZED") {
          const leaderReceipt = (tx as { consensus_data?: { leader_receipt?: Array<{ execution_result?: string; result?: { payload?: unknown } }> } })
            ?.consensus_data?.leader_receipt;
          const leaderOutcome = leaderReceipt?.[0];
          if (leaderOutcome?.execution_result === "SUCCESS") {
            setPhase("finalized");
          } else {
            setPhase("failed");
            const payload = leaderOutcome?.result?.payload;
            setError(typeof payload === "string" ? payload : "Transaction finalized with an error.");
          }
          return;
        }
        if (FAILED_STATUSES.has(statusName)) {
          setPhase("failed");
          setError("Validators could not reach consensus on this transaction.");
          return;
        }
        if (!PENDING_STATUSES.has(statusName) && statusName !== "") {
          // Unknown terminal-looking status; treat conservatively as failed
          // rather than silently reporting success.
          setPhase("failed");
          setError(`Unexpected transaction status: ${statusName}`);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      if (!cancelledRef.current) {
        setPhase("failed");
        setError("Timed out waiting for finalization. The transaction may still complete — check the explorer.");
      }
    } catch (e) {
      if (!cancelledRef.current) {
        setPhase("failed");
        setError(extractRevertReason(e));
      }
    }
  }, []);

  return { phase, txHash, error, run, reset };
}

function extractRevertReason(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Transaction failed.";
}
