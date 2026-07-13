"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  ArrowRight,
  Landmark,
  CreditCard,
  Banknote,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/app/count-up";
import { BudgetBar, usageColor } from "@/components/app/budget-bar";
import { SavingsRing } from "@/components/app/savings-ring";
import { Progress } from "@/components/ui/progress";
import { SpendDonut } from "@/components/charts/spend-donut";
import { BudgetBars } from "@/components/charts/budget-bars";
import { useMonth } from "@/components/app/month-context";
import { useApi, type SummaryDTO } from "@/lib/client";
import { inr, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const ACCOUNT_ICON: Record<string, React.ElementType> = {
  BANK: Landmark,
  CARD: CreditCard,
  CASH: Banknote,
  SAVINGS: PiggyBank,
};

const fade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

export default function DashboardPage() {
  const { month } = useMonth();
  const { data, loading } = useApi<SummaryDTO>(`/api/summary?month=${month}`);

  if (loading && !data) return <DashboardSkeleton />;
  if (!data) return null;

  const s = data;
  const overallColor = usageColor(s.overall.pct);
  const netThisMonth = BigInt(s.incomeMinor) - BigInt(s.expenseMinor);
  const expenseCats = s.categories.filter((c) => c.kind === "EXPENSE");
  const hasBudget = BigInt(s.overall.limitMinor) > 0n;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview for {monthLabel(month)}</p>
      </div>

      {/* Hero: net worth + month tiles */}
      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div {...fade} transition={{ duration: 0.4 }} className="lg:col-span-1">
          <Card className="h-full overflow-hidden bg-gradient-to-br from-primary/[0.08] to-transparent">
            <CardContent className="flex h-full flex-col justify-between p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="size-4" /> Net worth
              </div>
              <div className="mt-3">
                <CountUp minor={s.netWorthMinor} className="text-4xl font-semibold tracking-tight tabular" />
                <p className="mt-1 text-xs text-muted-foreground">Across {s.accounts.length} accounts, derived from the ledger</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fade} transition={{ duration: 0.4, delay: 0.05 }} className="lg:col-span-2">
          <div className="grid h-full gap-4 sm:grid-cols-3">
            <StatTile label="Income" icon={TrendingUp} tone="success" minor={s.incomeMinor} />
            <StatTile label="Expense" icon={TrendingDown} tone="destructive" minor={s.expenseMinor} />
            <StatTile
              label="Net this month"
              icon={ArrowRight}
              tone={netThisMonth >= 0n ? "success" : "destructive"}
              minor={netThisMonth.toString()}
            />
          </div>
        </motion.div>
      </div>

      {/* Accounts */}
      <motion.div {...fade} transition={{ duration: 0.4, delay: 0.1 }}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {s.accounts.map((a) => {
            const Icon = ACCOUNT_ICON[a.type] ?? Wallet;
            const neg = BigInt(a.balanceMinor) < 0n;
            return (
              <Card key={a.id}>
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-foreground/70">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{a.name}</div>
                    <div className={cn("text-lg font-semibold tabular", neg && "text-destructive")}>
                      <CountUp minor={a.balanceMinor} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </motion.div>

      {/* Budget + savings */}
      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div {...fade} transition={{ duration: 0.4, delay: 0.12 }} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Target className="size-4 text-primary" /> Overall budget
                </CardTitle>
                {hasBudget ? (
                  <Badge variant={s.overall.pct >= 100 ? "destructive" : s.overall.pct >= 80 ? "warning" : "success"}>
                    {Math.round(s.overall.pct)}% used
                  </Badge>
                ) : (
                  <Link href="/profile">
                    <Button variant="outline" size="sm">Set a budget</Button>
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasBudget ? (
                <>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-2xl font-semibold tabular">{inr(s.overall.spentMinor)}</div>
                      <div className="text-xs text-muted-foreground">of {inr(s.overall.limitMinor)} budgeted</div>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-lg font-semibold tabular", BigInt(s.overall.remainingMinor) < 0n ? "text-destructive" : "text-success")}>
                        {inr(s.overall.remainingMinor)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {BigInt(s.overall.remainingMinor) < 0n ? "over budget" : "remaining"}
                      </div>
                    </div>
                  </div>
                  <Progress value={Math.min(100, s.overall.pct)} indicatorClassName={overallColor.bar} className="h-3" />
                </>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No budget set for {monthLabel(month)}. Add one in Profile to track spending against a limit.
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fade} transition={{ duration: 0.4, delay: 0.15 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PiggyBank className="size-4 text-primary" /> Savings target
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {BigInt(s.savings.targetMinor) > 0n ? (
                <>
                  <SavingsRing current={s.savings.currentMinor} target={s.savings.targetMinor} pct={s.savings.pct} />
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    {inr(s.savings.currentMinor)} of {inr(s.savings.targetMinor)}
                  </p>
                </>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Set a savings target in Profile.
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div {...fade} transition={{ duration: 0.4, delay: 0.18 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Spend by category</CardTitle>
              <CardDescription>
                {s.biggestCategory
                  ? `Biggest: ${s.biggestCategory.name} (${inr(s.biggestCategory.spentMinor)})`
                  : "Expenses this month"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SpendDonut
                data={expenseCats.map((c) => ({ name: c.name, minor: c.spentMinor }))}
                totalLabel={s.expenseMinor}
              />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {expenseCats
                  .filter((c) => BigInt(c.spentMinor) > 0n)
                  .map((c, i) => (
                    <div key={c.categoryId} className="flex items-center gap-1.5 text-xs">
                      <span className="size-2.5 rounded-full" style={{ background: `var(--chart-${(i % 8) + 1})` }} />
                      {c.name}
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fade} transition={{ duration: 0.4, delay: 0.2 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Budget vs actual</CardTitle>
              <CardDescription>Spent against each category&apos;s limit</CardDescription>
            </CardHeader>
            <CardContent>
              <BudgetBars
                data={expenseCats.map((c) => ({
                  name: c.name,
                  spentMinor: c.spentMinor,
                  limitMinor: c.limitMinor,
                }))}
              />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Per-category budget bars */}
      <motion.div {...fade} transition={{ duration: 0.4, delay: 0.22 }}>
        <Card>
          <CardHeader>
            <CardTitle>Category budgets</CardTitle>
            <CardDescription>Live budget-vs-actual — the loop that drives your alerts</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {expenseCats.map((c) => (
              <BudgetBar
                key={c.categoryId}
                label={c.name}
                spent={c.spentMinor}
                limit={c.limitMinor}
                pct={c.pct}
              />
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function StatTile({
  label,
  icon: Icon,
  tone,
  minor,
}: {
  label: string;
  icon: React.ElementType;
  tone: "success" | "destructive";
  minor: string;
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col justify-between gap-3 p-5">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          {label}
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg",
              tone === "success" ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive",
            )}
          >
            <Icon className="size-4" />
          </span>
        </div>
        <CountUp minor={minor} className="text-2xl font-semibold tabular" />
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Skeleton className="h-9 w-40" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-36 lg:col-span-1" />
        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
