import type { GenLayerClient } from "genlayer-js/types";
import type { studionet } from "./genlayerClient";
import { getReadClient } from "./genlayerClient";
import { CONTRACT_ADDRESS } from "./constants";
import type { Contest, CreateContestInput } from "../types/contract";

type Client = GenLayerClient<typeof studionet>;

function parseContest(raw: unknown): Contest {
  const json = typeof raw === "string" ? raw : JSON.stringify(raw);
  return JSON.parse(json) as Contest;
}

export async function readContest(contestId: number, client: Client = getReadClient()): Promise<Contest> {
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_contest",
    args: [contestId],
  });
  return parseContest(result);
}

export async function readWithdrawable(address: string, client: Client = getReadClient()): Promise<bigint> {
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_withdrawable",
    args: [address],
  });
  return BigInt(result as number | string);
}

export async function readTotalEscrow(client: Client = getReadClient()): Promise<bigint> {
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_total_escrow",
    args: [],
  });
  return BigInt(result as number | string);
}

export async function readNextContestId(client: Client = getReadClient()): Promise<number> {
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_next_contest_id",
    args: [],
  });
  return Number(result);
}

/** Enumerates every contest that exists: ids 1..next_contest_id-1. */
export async function readAllContests(client: Client = getReadClient()): Promise<Contest[]> {
  const nextId = await readNextContestId(client);
  const ids = Array.from({ length: nextId - 1 }, (_, i) => i + 1);
  const contests = await Promise.all(
    ids.map((id) =>
      readContest(id, client).catch(() => null)
    )
  );
  return contests.filter((c): c is Contest => c !== null).sort((a, b) => b.contest_id - a.contest_id);
}

export async function createContest(client: Client, input: CreateContestInput): Promise<`0x${string}`> {
  const txId = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "create_contest",
    args: [
      input.participantAId,
      input.participantBId,
      input.eventId,
      input.sourceHost,
      input.sourcePathPrefix,
      input.canonicalSourceUrl,
      input.retrievalMethod,
      input.matchCloseTime,
      input.settleAfter,
      input.resolutionDeadline,
    ],
    value: input.stakeWei,
  });
  return txId as `0x${string}`;
}

export async function joinContest(client: Client, contestId: number, stakeWei: bigint): Promise<`0x${string}`> {
  const txId = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "join_contest",
    args: [contestId],
    value: stakeWei,
  });
  return txId as `0x${string}`;
}

export async function cancelUnmatched(client: Client, contestId: number): Promise<`0x${string}`> {
  const txId = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "cancel_unmatched",
    args: [contestId],
    value: 0n,
  });
  return txId as `0x${string}`;
}

/** The ONLY resolution entry point. Takes nothing but a contest id — no
 * result, rank, winner, or URL is ever supplied by this frontend. */
export async function settleContest(client: Client, contestId: number): Promise<`0x${string}`> {
  const txId = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "settle",
    args: [contestId],
    value: 0n,
  });
  return txId as `0x${string}`;
}

export async function refundAfterDeadline(client: Client, contestId: number): Promise<`0x${string}`> {
  const txId = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "refund_after_deadline",
    args: [contestId],
    value: 0n,
  });
  return txId as `0x${string}`;
}

export async function withdraw(client: Client): Promise<`0x${string}`> {
  const txId = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "withdraw",
    args: [],
    value: 0n,
  });
  return txId as `0x${string}`;
}
