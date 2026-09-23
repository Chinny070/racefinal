import { createClient } from "genlayer-js";
import type { GenLayerClient } from "genlayer-js/types";
import { studionet } from "genlayer-js/chains";

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

/**
 * Read-only client — no wallet required. Used everywhere the app only
 * needs to display on-chain state (landing stats, explorer, contest
 * detail before a wallet is connected). This is what makes the app
 * "useful read-only before wallet connection", per spec.
 */
let readClient: GenLayerClient<typeof studionet> | null = null;

export function getReadClient(): GenLayerClient<typeof studionet> {
  if (!readClient) {
    readClient = createClient({ chain: studionet });
  }
  return readClient;
}

/**
 * Wallet-backed client for an injected EIP-1193 provider (MetaMask etc).
 * `account` is the connected address; `provider` is window.ethereum.
 * Must call `.connect('studionet')` before issuing writes, so the
 * provider is actually switched to StudioNet.
 */
export async function createWalletClient(
  account: `0x${string}`,
  provider: Eip1193Provider
): Promise<GenLayerClient<typeof studionet>> {
  const client = createClient({
    chain: studionet,
    account,
    provider,
  });
  await client.connect("studionet");
  return client as GenLayerClient<typeof studionet>;
}

export { studionet };
