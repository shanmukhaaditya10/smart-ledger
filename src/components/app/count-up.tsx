"use client";

import * as React from "react";
import { animate } from "framer-motion";
import { inr, rupees, toBig, type Minor } from "@/lib/format";

/**
 * Number count-up for money. Animates the numeric value on mount / when the
 * target changes, then snaps to the EXACT integer-paise formatting on the final
 * frame so we never display a float-rounding artifact.
 */
export function CountUp({
  minor,
  withSymbol = true,
  className,
  duration = 0.9,
}: {
  minor: Minor | bigint;
  withSymbol?: boolean;
  className?: string;
  duration?: number;
}) {
  const target = toBig(minor);
  const ref = React.useRef<HTMLSpanElement>(null);
  const prev = React.useRef<bigint>(0n);
  const fmt = withSymbol ? inr : rupees;

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const fromRupees = Number(prev.current) / 100;
    const toRupees = Number(target) / 100;
    const controls = animate(fromRupees, toRupees, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate(v) {
        // format the interpolated value as whole paise for smoothness
        node.textContent = fmt(BigInt(Math.round(v * 100)));
      },
      onComplete() {
        node.textContent = fmt(target); // exact
      },
    });
    prev.current = target;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.toString(), duration]);

  return <span ref={ref} className={className}>{fmt(target)}</span>;
}
