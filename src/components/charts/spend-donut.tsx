"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { inr, minorToNum, type Minor } from "@/components/charts/chart-utils";

export type DonutDatum = { name: string; minor: Minor };

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

export function SpendDonut({ data, totalLabel }: { data: DonutDatum[]; totalLabel: Minor }) {
  const chartData = data
    .filter((d) => BigInt(d.minor) > 0n)
    .map((d) => ({ ...d, value: minorToNum(d.minor) }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
        No spending yet this month.
      </div>
    );
  }

  return (
    <div className="relative h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={68}
            outerRadius={100}
            paddingAngle={2}
            stroke="var(--card)"
            strokeWidth={2}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as DonutDatum;
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-1.5 text-sm shadow-md">
                  <div className="font-medium">{p.name}</div>
                  <div className="tabular text-muted-foreground">{inr(p.minor)}</div>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted-foreground">Spent</span>
        <span className="text-xl font-semibold tabular">{inr(totalLabel)}</span>
      </div>
    </div>
  );
}
