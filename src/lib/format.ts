import { formatINR, formatMinor, formatINRCompact, usagePct } from "@/lib/money";

/**
 * Client-side formatting. The API sends money as a decimal STRING of paise
 * (BigInt can't cross JSON). We re-parse to bigint here and reuse the exact same
 * formatting helpers the server uses, so display never diverges.
 */

export type Minor = string; // paise as a string, e.g. "12345678"

export function toBig(minor: Minor | bigint | number): bigint {
  if (typeof minor === "bigint") return minor;
  return BigInt(minor);
}

export const inr = (minor: Minor | bigint) => formatINR(toBig(minor));
export const rupees = (minor: Minor | bigint) => formatMinor(toBig(minor));
export const inrCompact = (minor: Minor | bigint) => formatINRCompact(toBig(minor));
export const pctOf = (used: Minor | bigint, limit: Minor | bigint) =>
  usagePct(toBig(used), toBig(limit));

/** Signed money for account/net deltas — always shows the sign. */
export function signedInr(minor: Minor | bigint): string {
  const v = toBig(minor);
  const base = formatINR(v < 0n ? -v : v);
  return v < 0n ? `−${base}` : `+${base}`;
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function monthLabelShort(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}
