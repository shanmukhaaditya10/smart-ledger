"use client";

import * as React from "react";
import { Mail, CalendarDays, Wallet, PiggyBank, Save } from "lucide-react";
import { toast } from "sonner";
import {
  useApi,
  apiPut,
  revalidate,
  ApiError,
  type MeDTO,
  type PreferencesDTO,
} from "@/lib/client";
import { inr, rupees, monthLabel, formatDateShort } from "@/lib/format";
import { useMonth } from "@/components/app/month-context";
import { PageHeader } from "@/components/app/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ---------- money <-> input helpers (integer paise, no floats) ----------

/** Constrain a raw input string to digits + one dot + up to 2 decimals. */
function sanitizeAmount(s: string): string {
  let v = s.replace(/[^\d.]/g, ""); // digits and dots only (drops grouping commas)
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    const head = v.slice(0, firstDot + 1);
    const tail = v.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
    v = head + tail;
  }
  return v;
}

/** Tolerant parse of a sanitized amount string to integer paise (bigint). */
function inputToMinor(s: string): bigint {
  const raw = s.replace(/,/g, "").trim();
  if (raw === "" || raw === ".") return 0n;
  const m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(raw);
  if (!m) return 0n;
  const whole = m[1] ? BigInt(m[1]) : 0n;
  const frac = BigInt((m[2] ?? "").padEnd(2, "0"));
  return whole * 100n + frac;
}

/** Plain decimal rupee string (no symbol, no grouping) for the API body. */
function minorToPlain(minor: bigint): string {
  const whole = minor / 100n;
  const paise = (minor % 100n).toString().padStart(2, "0");
  return `${whole}.${paise}`;
}

// ---------- form model ----------

type FormState = {
  overall: string;
  savings: string;
  cats: Record<string, string>;
};

function buildForm(d: PreferencesDTO): FormState {
  const budgetCats = d.budget?.categoryBudgets ?? [];
  const cats: Record<string, string> = {};
  for (const c of d.categories) {
    if (c.kind !== "EXPENSE") continue;
    const cb = budgetCats.find((b) => b.categoryId === c.id);
    cats[c.id] = cb ? sanitizeAmount(rupees(cb.limitMinor)) : "";
  }
  return {
    overall: d.budget ? sanitizeAmount(rupees(d.budget.overallLimitMinor)) : "",
    savings: d.budget ? sanitizeAmount(rupees(d.budget.savingsTargetMinor)) : "",
    cats,
  };
}

// ---------- small presentational pieces ----------

function AmountInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        ₹
      </span>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="0.00"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(sanitizeAmount(e.target.value))}
        className="pl-7 tabular"
      />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- page ----------

export default function ProfilePage() {
  const { month } = useMonth();
  const me = useApi<MeDTO>("/api/me");
  const prefs = useApi<PreferencesDTO>(`/api/preferences?month=${month}`);

  const [form, setForm] = React.useState<FormState | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Resync the form whenever fresh preferences arrive (month switch, refetch).
  React.useEffect(() => {
    if (prefs.data) setForm(buildForm(prefs.data));
  }, [prefs.data]);

  const user = me.data && me.data.user ? me.data.user : null;

  // The budget section is "ready" only once the loaded data matches the
  // currently selected month (avoids flashing the previous month's values).
  const budgetReady = !!(form && prefs.data && prefs.data.month === month);

  const expenseCategories = React.useMemo(
    () => (prefs.data?.categories ?? []).filter((c) => c.kind === "EXPENSE"),
    [prefs.data],
  );

  const overallMinor = form ? inputToMinor(form.overall) : 0n;
  const catSumMinor = React.useMemo(() => {
    if (!form) return 0n;
    return expenseCategories.reduce(
      (acc, c) => acc + inputToMinor(form.cats[c.id] ?? ""),
      0n,
    );
  }, [form, expenseCategories]);
  const overBudget = overallMinor > 0n && catSumMinor > overallMinor;

  function setCat(categoryId: string, v: string) {
    setForm((f) => (f ? { ...f, cats: { ...f.cats, [categoryId]: v } } : f));
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      await apiPut("/api/preferences", {
        month,
        overallLimit: minorToPlain(inputToMinor(form.overall)),
        savingsTarget: minorToPlain(inputToMinor(form.savings)),
        categoryBudgets: expenseCategories.map((c) => ({
          categoryId: c.id,
          limit: minorToPlain(inputToMinor(form.cats[c.id] ?? "")),
        })),
      });
      toast.success("Preferences saved");
      revalidate();
      prefs.refetch();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Could not save preferences",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Profile & Preferences"
        subtitle="Your account and the budget targets for the selected month."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Section 1 — Profile */}
        <Card className="lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your Smart Ledger account.</CardDescription>
          </CardHeader>
          <CardContent>
            {user ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{user.name}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {user.email}
                    </div>
                  </div>
                </div>

                <dl className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="size-4 shrink-0" />
                    <dt className="sr-only">Email</dt>
                    <dd className="truncate text-foreground">{user.email}</dd>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="size-4 shrink-0" />
                    <dt className="sr-only">Member since</dt>
                    <dd className="text-foreground">
                      Member since {formatDateShort(user.createdAt)}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-4 w-36" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 2 — Budget & targets */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-4 text-muted-foreground" />
              Budget &amp; targets for {monthLabel(month)}
            </CardTitle>
            <CardDescription>
              Set your overall limit, savings goal, and per-category budgets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!budgetReady || !form ? (
              <FormSkeleton />
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="overall">Overall monthly budget</Label>
                    <AmountInput
                      id="overall"
                      value={form.overall}
                      onChange={(v) =>
                        setForm((f) => (f ? { ...f, overall: v } : f))
                      }
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="savings" className="flex items-center gap-1.5">
                      <PiggyBank className="size-4 text-muted-foreground" />
                      Savings target
                    </Label>
                    <AmountInput
                      id="savings"
                      value={form.savings}
                      onChange={(v) =>
                        setForm((f) => (f ? { ...f, savings: v } : f))
                      }
                      disabled={saving}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-sm font-medium">Category budgets</h3>
                    <span className="text-xs text-muted-foreground">
                      Expense categories
                    </span>
                  </div>

                  {expenseCategories.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No expense categories yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {expenseCategories.map((c) => (
                        <div
                          key={c.id}
                          className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_11rem]"
                        >
                          <Label htmlFor={`cat-${c.id}`} className="text-foreground">
                            {c.name}
                          </Label>
                          <AmountInput
                            id={`cat-${c.id}`}
                            value={form.cats[c.id] ?? ""}
                            onChange={(v) => setCat(c.id, v)}
                            disabled={saving}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sanity hint: sum of category budgets vs overall */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">
                    Sum of category budgets:{" "}
                    <span className="tabular font-medium text-foreground">
                      {inr(catSumMinor)}
                    </span>
                  </span>
                  {overBudget ? (
                    <Badge variant="warning">
                      Exceeds overall by{" "}
                      <span className="tabular">
                        {inr(catSumMinor - overallMinor)}
                      </span>
                    </Badge>
                  ) : overallMinor > 0n ? (
                    <Badge variant="success">
                      <span className="tabular">
                        {inr(overallMinor - catSumMinor)}
                      </span>{" "}
                      left of overall
                    </Badge>
                  ) : null}
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                    <Save className="size-4" />
                    {saving ? "Saving…" : "Save preferences"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
