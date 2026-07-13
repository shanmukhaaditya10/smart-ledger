"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatINRCompact } from "@/lib/money";
import { inr, minorToNum, type Minor } from "@/components/charts/chart-utils";

export type BudgetBarDatum = { name: string; spentMinor: Minor; limitMinor: Minor | null };

export function BudgetBars({ data }: { data: BudgetBarDatum[] }) {
  const chartData = data
    .filter((d) => BigInt(d.spentMinor) > 0n || (d.limitMinor && BigInt(d.limitMinor) > 0n))
    .map((d) => ({
      name: d.name,
      spent: minorToNum(d.spentMinor),
      budget: d.limitMinor ? minorToNum(d.limitMinor) : 0,
      spentMinor: d.spentMinor,
      limitMinor: d.limitMinor,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        Set category budgets to see this chart.
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={4}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) => formatINRCompact(BigInt(Math.round(v)) * 100n)}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.4 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as { spentMinor: Minor; limitMinor: Minor | null };
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
                  <div className="mb-1 font-medium">{label}</div>
                  <div className="flex items-center gap-2 tabular">
                    <span className="inline-block size-2 rounded-full bg-[var(--chart-1)]" />
                    Spent <span className="ml-auto font-medium">{inr(row.spentMinor)}</span>
                  </div>
                  <div className="flex items-center gap-2 tabular text-muted-foreground">
                    <span className="inline-block size-2 rounded-full bg-[var(--muted-foreground)]" />
                    Budget
                    <span className="ml-auto font-medium">
                      {row.limitMinor ? inr(row.limitMinor) : "—"}
                    </span>
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="budget" fill="var(--muted-foreground)" opacity={0.25} radius={[4, 4, 0, 0]} />
          <Bar dataKey="spent" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
