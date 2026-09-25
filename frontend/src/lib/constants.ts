export const CONTRACT_ADDRESS = "0xc66BC1f3DCd600c1Ce2Fb23db2D388E01F762B74" as const;

export const CHAIN_ID = 61999;
export const RPC_URL = "https://studio.genlayer.com/api";
export const STUDIO_EXPLORER_URL = "https://studio.genlayer.com";

/** Contest status codes, matching contracts/race_final.py exactly. */
export const CONTEST_STATUS = {
  CREATED: 0,
  MATCHED: 1,
  SETTLED_A: 2,
  SETTLED_B: 3,
  TIE: 4,
  REFUNDED: 5,
  CANCELLED: 6,
} as const;

export type ContestStatus = (typeof CONTEST_STATUS)[keyof typeof CONTEST_STATUS];

export const STATUS_LABEL: Record<number, string> = {
  0: "Awaiting counterparty",
  1: "Source locked",
  2: "Finalized — A wins",
  3: "Finalized — B wins",
  4: "Finalized — tie",
  5: "Refunded",
  6: "Cancelled",
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const RETRIEVAL_METHODS = ["get", "render"] as const;

/** Suggested stake presets shown in the create-contest form, in whole GEN. */
export const STAKE_PRESETS = [0.01, 0.05, 0.1, 1] as const;
