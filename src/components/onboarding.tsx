"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Wallet, Target, PiggyBank, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPost, revalidate, type AccountDTO, type CategoryDTO } from "@/lib/client";
import { monthLabel } from "@/lib/format";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { AmountInput } from "@/components/app/amount-input";

export function OnboardingForm({ month, userName }: { month: string; userName: string }) {
  const router = useRouter();
  const [accounts, setAccounts] = React.useState<AccountDTO[]>([]);
  const [categories, setCategories] = React.useState<CategoryDTO[]>([]);
  const [salary, setSalary] = React.useState("");
  const [salaryAccountId, setSalaryAccountId] = React.useState<string>("");
  const [overall, setOverall] = React.useState("");
  const [savings, setSavings] = React.useState("");
  const [catBudgets, setCatBudgets] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    apiGet<{ accounts: AccountDTO[]; categories: CategoryDTO[] }>("/api/meta").then((d) => {
      setAccounts(d.accounts);
      setCategories(d.categories);
      const bank = d.accounts.find((a) => a.type === "BANK") ?? d.accounts[0];
      if (bank) setSalaryAccountId(bank.id);
    });
  }, []);

  const expenseCats = categories.filter((c) => c.kind === "EXPENSE");

  async function finish(withData: boolean) {
    setSubmitting(true);
    try {
      if (withData) {
        await apiPost("/api/onboarding", {
          month,
          monthlySalary: salary || "0",
          salaryAccountId: salaryAccountId || null,
          overallLimit: overall || "0",
          savingsTarget: savings || "0",
          categoryBudgets: Object.entries(catBudgets)
            .filter(([, v]) => v.trim() !== "")
            .map(([categoryId, limit]) => ({ categoryId, limit })),
        });
        toast.success("Your ledger is ready");
      }
      revalidate();
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Wallet className="size-5" />
          </span>
          <span className="font-semibold tracking-tight">Smart Ledger</span>
        </div>
        <ThemeToggle />
      </header>

      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-2xl px-6 pb-16"
      >
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" /> {monthLabel(month)}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Welcome, {userName.split(" ")[0]}.
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            Set your income, budgets and a savings target. You can change all of this anytime —
            or skip and use defaults.
          </p>
        </div>

        <div className="space-y-5">
          {/* Salary */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-success/12 text-success">
                  <Wallet className="size-4" />
                </span>
                <div>
                  <div className="font-medium">Monthly income</div>
                  <div className="text-xs text-muted-foreground">Seeds a real salary entry so your ledger reconciles.</div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Salary</Label>
                  <AmountInput value={salary} onChange={setSalary} placeholder="1,20,000" />
                </div>
                <div className="space-y-1.5">
                  <Label>Deposit to</Label>
                  <Select value={salaryAccountId} onValueChange={setSalaryAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Budget + savings */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Target className="size-4" />
                </span>
                <div>
                  <div className="font-medium">Budget & savings target</div>
                  <div className="text-xs text-muted-foreground">Drives your budget-vs-actual and the savings ring.</div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Overall monthly budget</Label>
                  <AmountInput value={overall} onChange={setOverall} placeholder="60,000" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <PiggyBank className="size-3.5" /> Savings target
                  </Label>
                  <AmountInput value={savings} onChange={setSavings} placeholder="3,00,000" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Category budgets */}
          <Card>
            <CardContent className="p-5">
              <div className="mb-4">
                <div className="font-medium">Per-category budgets</div>
                <div className="text-xs text-muted-foreground">Optional. Leave blank to skip a category.</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {expenseCats.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3">
                    <Label className="text-sm text-muted-foreground">{c.name}</Label>
                    <div className="w-40">
                      <AmountInput
                        value={catBudgets[c.id] ?? ""}
                        onChange={(v) => setCatBudgets((s) => ({ ...s, [c.id]: v }))}
                        placeholder="0"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={() => finish(false)} disabled={submitting}>
            Skip for now
          </Button>
          <Button onClick={() => finish(true)} disabled={submitting} className="gap-2" size="lg">
            {submitting ? "Saving…" : "Finish setup"}
            {!submitting && <ArrowRight className="size-4" />}
          </Button>
        </div>
      </motion.main>
    </div>
  );
}
