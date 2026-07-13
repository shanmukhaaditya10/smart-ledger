"use client";

import { motion } from "framer-motion";
import { inr, type Minor } from "@/lib/format";

/** Animated SVG progress ring for the savings target. */
export function SavingsRing({
  current,
  target,
  pct,
  size = 160,
}: {
  current: Minor;
  target: Minor;
  pct: number;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c * (1 - clamped / 100);
  const hit = pct >= 100 && BigInt(target) > 0n;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={hit ? "var(--success)" : "var(--primary)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-semibold tabular">{Math.round(clamped)}%</span>
        <span className="mt-0.5 text-xs text-muted-foreground">of target</span>
        <span className="mt-1 text-xs font-medium tabular">{inr(current)}</span>
      </div>
    </div>
  );
}
