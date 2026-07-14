import { formatINR, formatMinor } from "@/lib/money";

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
