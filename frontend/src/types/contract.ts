export interface ResultRecord {
  source_ok: boolean;
  event_match: boolean;
  is_final: boolean;
  participant_a_found: boolean;
  participant_b_found: boolean;
  participant_a_rank: number;
  participant_b_rank: number;
  settled_at: number;
}

export interface Contest {
  contest_id: number;
  creator: string;
  counterparty: string;
  participant_a_id: string;
  participant_b_id: string;
  event_id: string;
  source_host: string;
  source_path_prefix: string;
  canonical_source_url: string;
  retrieval_method: "get" | "render";
  stake_wei: number;
  match_close_time: number;
  settle_after: number;
  resolution_deadline: number;
  status: number;
  created_at: number;
  matched_at: number;
  resolved: boolean;
  winner: string;
  has_result_record: boolean;
  result?: ResultRecord;
}

export interface CreateContestInput {
  participantAId: string;
  participantBId: string;
  eventId: string;
  sourceHost: string;
  sourcePathPrefix: string;
  canonicalSourceUrl: string;
  retrievalMethod: "get" | "render";
  matchCloseTime: number;
  settleAfter: number;
  resolutionDeadline: number;
  stakeWei: bigint;
}

/** Submitted -> Pending consensus -> Finalized / Failed */
export type TxPhase = "idle" | "submitted" | "pending" | "finalized" | "failed";
