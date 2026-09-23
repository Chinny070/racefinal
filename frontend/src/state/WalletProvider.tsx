import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { GenLayerClient } from "genlayer-js/types";
import { createWalletClient, type Eip1193Provider, type studionet } from "../lib/genlayerClient";
import { CHAIN_ID } from "../lib/constants";

interface WalletState {
  address: `0x${string}` | null;
  connecting: boolean;
  error: string | null;
  client: GenLayerClient<typeof studionet> | null;
  hasInjectedWallet: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

function getProvider(): Eip1193Provider | null {
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return eth ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [client, setClient] = useState<GenLayerClient<typeof studionet> | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Many wallets inject window.ethereum asynchronously, slightly after our
  // first render, and some browsers/extensions delay it further (e.g. after
  // a "click extension icon to unlock" step). A one-time useMemo at mount
  // would permanently miss that and lock the button in a disabled
  // "No wallet found" state even once the wallet is actually present, which
  // is exactly what made Connect appear to do nothing. Poll briefly instead
  // and also listen for the standard EIP-6963/legacy injection event.
  const [hasInjectedWallet, setHasInjectedWallet] = useState(() => getProvider() !== null);

  useEffect(() => {
    if (hasInjectedWallet) return;
    const check = () => setHasInjectedWallet(getProvider() !== null);
    window.addEventListener("ethereum#initialized", check);
    const interval = window.setInterval(check, 500);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 5000);
    return () => {
      window.removeEventListener("ethereum#initialized", check);
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [hasInjectedWallet]);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setError(
        "No injected wallet found in this browser. Install MetaMask (or another EIP-1193 wallet extension), then reload this page."
      );
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const account = accounts[0] as `0x${string}` | undefined;
      if (!account) throw new Error("No account returned by wallet.");
      const walletClient = await createWalletClient(account, provider);
      setAddress(account);
      setClient(walletClient);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setClient(null);
  }, []);

  useEffect(() => {
    const provider = getProvider();
    if (!provider?.on) return;
    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (!accounts || accounts.length === 0) {
        disconnect();
      } else {
        setAddress(accounts[0] as `0x${string}`);
        void connect();
      }
    };
    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", () => window.location.reload());
    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: WalletState = {
    address,
    connecting,
    error,
    client,
    hasInjectedWallet,
    connect,
    disconnect,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export const REQUIRED_CHAIN_ID = CHAIN_ID;
