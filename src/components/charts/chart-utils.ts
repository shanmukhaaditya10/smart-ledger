import { formatINR, minorToRupeesNumber } from "@/lib/money";

export type Minor = string;

export const inr = (m: Minor | bigint) => formatINR(typeof m === "bigint" ? m : BigInt(m));
export const minorToNum = (m: Minor | bigint) =>
  minorToRupeesNumber(typeof m === "bigint" ? m : BigInt(m));
