"use client";

import * as React from "react";
import { addMonths, currentMonthKey } from "@/lib/date";

type MonthCtx = {
  month: string;
  setMonth: (m: string) => void;
  next: () => void;
  prev: () => void;
  isCurrent: boolean;
};

const Ctx = React.createContext<MonthCtx | null>(null);

export function MonthProvider({ children }: { children: React.ReactNode }) {
  const [month, setMonth] = React.useState(() => currentMonthKey());
  const value: MonthCtx = {
    month,
    setMonth,
    next: () => setMonth((m) => addMonths(m, 1)),
    prev: () => setMonth((m) => addMonths(m, -1)),
    isCurrent: month === currentMonthKey(),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMonth() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useMonth must be used within MonthProvider");
  return ctx;
}
