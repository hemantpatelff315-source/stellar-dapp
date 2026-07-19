"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  connectWallet as connectWalletApi,
  getConnectedAddress,
} from "@/lib/wallet";

interface WalletContextValue {
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

const STORAGE_KEY = "stellarfund.wallet.connected";

/**
 * Wallet connection state via the Context API. Persists a "was connected" flag
 * so the session is silently restored on reload (without re-prompting).
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) !== "1") return;
    // Silently restore the address if Freighter still grants access.
    getConnectedAddress().then((addr) => {
      if (addr) setAddress(addr);
    });
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const state = await connectWalletApi();
      setAddress(state.address);
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet");
      throw e;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = useMemo(
    () => ({ address, isConnecting, error, connect, disconnect }),
    [address, isConnecting, error, connect, disconnect],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

/** Access wallet connection state. Must be used within `WalletProvider`. */
export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
