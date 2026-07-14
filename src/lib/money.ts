/**
 * Integer-money helpers.
 *
 * Money is ALWAYS represented as `bigint` minor units (paise) in business logic
 * and the database. We convert to/from rupee strings only at the display and
 * input edges. We NEVER use `parseFloat`/`Number` on money — floating point
 * cannot represent decimal currency exactly and silently drifts.
 *
 * 1 rupee = 100 paise.
 */

export const MINOR_PER_MAJOR = 100n;

/**
 * Parse a human-entered rupee amount into integer paise.
 *
 * Accepts strings like "1234", "1234.5", "1,23,456.78", "  99.90 ".
 * - Grouping commas are ignored.
 * - At most 2 fractional digits (paise). More is a hard error, not a round —
 *   we refuse to silently lose precision on money.
 * - Result is always non-negative; sign is modeled by entry type, not amount.
 *
 * Throws on anything that isn't a clean non-negative amount.
 */
export function parseRupeesToMinor(input: string): bigint {
  const raw = input.trim().replace(/,/g, "");
  if (raw === "") throw new Error("Amount is required");
  // Optional leading +, digits, optional . and up to 2 digits.
  const match = /^\+?(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) {
    throw new Error(
      `Invalid amount "${input}" — use rupees with up to 2 decimals (e.g. 1234.56)`,
    );
  }
  const whole = BigInt(match[1]);
  const fracStr = (match[2] ?? "").padEnd(2, "0"); // "5" -> "50", "" -> "00"
  const frac = BigInt(fracStr);
  return whole * MINOR_PER_MAJOR + frac;
}

/** Split signed paise into { sign, rupees, paise } string parts. */
function splitMinor(minor: bigint): { neg: boolean; rupees: string; paise: string } {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const rupees = (abs / MINOR_PER_MAJOR).toString();
  const paise = (abs % MINOR_PER_MAJOR).toString().padStart(2, "0");
  return { neg, rupees, paise };
}

/** Group an integer digit-string using the Indian system: 12,34,567. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  // group the head in pairs from the right
  const grouped = head.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${grouped},${tail}`;
}

/**
 * Format paise as a plain rupee string with 2 decimals and Indian grouping,
 * e.g. 12345678n -> "1,23,456.78". No currency symbol.
 */
export function formatMinor(minor: bigint): string {
  const { neg, rupees, paise } = splitMinor(minor);
  return `${neg ? "-" : ""}${groupIndian(rupees)}.${paise}`;
}

/** Format paise as an INR amount, e.g. "₹1,23,456.78". */
export function formatINR(minor: bigint): string {
  const { neg, rupees, paise } = splitMinor(minor);
  return `${neg ? "-" : ""}₹${groupIndian(rupees)}.${paise}`;
}

/**
 * Compact INR for tight UI (e.g. axis ticks): ₹1.2L, ₹3.4Cr, ₹9,999.
 * Rounds for display only — never used in ledger math.
 */
export function formatINRCompact(minor: bigint): string {
  const neg = minor < 0n;
  const absRupees = Number((neg ? -minor : minor) / MINOR_PER_MAJOR);
  const sign = neg ? "-" : "";
  if (absRupees >= 1_00_00_000) return `${sign}₹${(absRupees / 1_00_00_000).toFixed(1)}Cr`;
  if (absRupees >= 1_00_000) return `${sign}₹${(absRupees / 1_00_000).toFixed(1)}L`;
  if (absRupees >= 1_000) return `${sign}₹${(absRupees / 1_000).toFixed(1)}k`;
  return `${sign}₹${absRupees.toLocaleString("en-IN")}`;
}

/** Rupees as a float for charts ONLY (never for ledger math). */
export function minorToRupeesNumber(minor: bigint): number {
  // Safe for display-scale amounts; charts don't need exactness.
  return Number(minor) / 100;
}

/** Percentage (0..>100) of used vs limit, guarding divide-by-zero. */
export function usagePct(used: bigint, limit: bigint): number {
  if (limit <= 0n) return 0;
  return Number((used * 10000n) / limit) / 100;
}
