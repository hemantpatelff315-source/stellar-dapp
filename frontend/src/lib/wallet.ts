/**
 * Freighter wallet integration.
 *
 * Thin, testable wrapper around `@stellar/freighter-api` that normalizes its
 * responses and surfaces friendly errors. All wallet access flows through here
 * so the rest of the app never imports the Freighter API directly.
 */
import {
  isConnected,
  isAllowed,
  setAllowed,
  requestAccess,
  getAddress,
  getNetwork,
  signTransaction,
} from "@stellar/freighter-api";
import { config } from "./config";

export interface WalletState {
  address: string;
  network: string;
}

/** Whether the Freighter extension is installed and reachable. */
export async function isFreighterInstalled(): Promise<boolean> {
  try {
    const res = await isConnected();
    return Boolean(res?.isConnected);
  } catch {
    return false;
  }
}

/**
 * Connect the wallet, requesting access if not already granted.
 * @throws Error with a user-facing message on failure.
 */
export async function connectWallet(): Promise<WalletState> {
  if (!(await isFreighterInstalled())) {
    throw new Error(
      "Freighter wallet not detected. Install it from freighter.app to continue.",
    );
  }

  const allowed = await isAllowed();
  if (!allowed?.isAllowed) {
    await setAllowed();
  }

  const access = await requestAccess();
  if (access.error) {
    throw new Error(access.error);
  }

  const net = await getNetwork();
  return { address: access.address, network: net.network ?? config.network };
}

/** Read the currently connected address, or null if not connected. */
export async function getConnectedAddress(): Promise<string | null> {
  try {
    const res = await getAddress();
    return res.address || null;
  } catch {
    return null;
  }
}

/** Sign a base64 XDR transaction envelope with Freighter. */
export async function signXdr(xdr: string): Promise<string> {
  const result = await signTransaction(xdr, {
    networkPassphrase: config.networkPassphrase,
  });
  if (result.error) {
    throw new Error(result.error);
  }
  return result.signedTxXdr;
}
