import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, de-duplicating conflicting utilities. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const STROOPS_PER_XLM = 10_000_000n;

/**
 * Convert stroops (bigint) to a human XLM string.
 * @example stroopsToXlm(15_000_000n) // "1.5"
 */
export function stroopsToXlm(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_XLM;
  const frac = stroops % STROOPS_PER_XLM;
  if (frac === 0n) return whole.toString();
  // Trim trailing zeros from the 7-digit fractional part.
  const fracStr = frac.toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

/**
 * Convert an XLM string/number to stroops (bigint).
 * Throws on malformed input so callers can surface a validation error.
 */
export function xlmToStroops(xlm: string | number): bigint {
  const value = typeof xlm === "number" ? xlm.toString() : xlm.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(value)) {
    throw new Error("Invalid XLM amount");
  }
  const [whole, frac = ""] = value.split(".");
  const paddedFrac = frac.padEnd(7, "0");
  return BigInt(whole) * STROOPS_PER_XLM + BigInt(paddedFrac);
}

/** Format stroops as a display string with an XLM suffix. */
export function formatXlm(stroops: bigint, opts?: { suffix?: boolean }): string {
  const value = stroopsToXlm(stroops);
  const [whole, frac] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const num = frac ? `${grouped}.${frac}` : grouped;
  return opts?.suffix === false ? num : `${num} XLM`;
}

/** Funding progress as an integer percentage, capped at 100. */
export function fundingProgress(raised: bigint, goal: bigint): number {
  if (goal <= 0n) return 0;
  const pct = Number((raised * 10000n) / goal) / 100;
  return Math.min(100, Math.max(0, Math.round(pct * 100) / 100));
}

/** Truncate a Stellar address/contract id for compact display. */
export function truncateAddress(addr: string, size = 4): string {
  if (addr.length <= size * 2 + 3) return addr;
  return `${addr.slice(0, size)}…${addr.slice(-size)}`;
}

/** Human-readable time remaining until a unix-seconds deadline. */
export function timeRemaining(deadline: number, now = Date.now()): string {
  const diff = deadline * 1000 - now;
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

/** True when a unix-seconds deadline is in the past. */
export function isExpired(deadline: number, now = Date.now()): boolean {
  return deadline * 1000 <= now;
}
