"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Check,
  Info,
  Repeat,
  Loader2,
} from "lucide-react";

import {
  apiPost,
  revalidate,
  useApi,
  type AccountDTO,
  type CategoryDTO,
  type EntryDTO,
  ApiError,
} from "@/lib/client";
import { inr } from "@/lib/format";

import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EntryType = "INCOME" | "EXPENSE" | "TRANSFER";

type MetaDTO = { accounts: AccountDTO[]; categories: CategoryDTO[] };

type CreateEntryResponse = {
  entry: EntryDTO;
  notifications: { kind: string; message: string }[];
  recurringRuleId: string | null;
};

const TYPES: { value: EntryType; label: string; Icon: typeof ArrowDownLeft }[] = [
  { value: "INCOME", label: "Income", Icon: ArrowDownLeft },
  { value: "EXPENSE", label: "Expense", Icon: ArrowUpRight },
  { value: "TRANSFER", label: "Transfer", Icon: ArrowLeftRight },
];

const todayKey = () => new Date().toISOString().slice(0, 10);
const dayFromKey = (key: string) => {
  const d = Number(key.slice(8, 10));
  return Number.isFinite(d) && d >= 1 && d <= 31 ? d : 1;
};

/** Sanitize a free-typed amount to digits + one dot + up to 2 decimals. No floats. */
function sanitizeAmount(raw: string): string {
  let s = raw.replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    // keep first dot, drop the rest
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    const [whole, frac = ""] = s.split(".");
    s = whole + "." + frac.slice(0, 2);
  }
  return s;
}

/** Rupee string → integer paise as bigint (preview only). null if not parseable. */
function rupeesToMinor(s: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) return null;
  const whole = BigInt(m[1]);
  const frac = (m[2] ?? "").padEnd(2, "0");
  return whole * 100n + BigInt(frac);
}

const isPositiveAmount = (s: string): boolean => {
  const minor = rupeesToMinor(s);
  return minor !== null && minor > 0n;
};

type Errors = Partial<Record<
  "amount" | "fromAccountId" | "toAccountId" | "categoryId",
  string
>>;

export default function AddEntryPage() {
  const { data: meta, loading: metaLoading } = useApi<MetaDTO>("/api/meta");

  const [type, setType] = React.useState<EntryType>("EXPENSE");
  const [amount, setAmount] = React.useState("");
  const [fromAccountId, setFromAccountId] = React.useState<string>("");
  const [toAccountId, setToAccountId] = React.useState<string>("");
  const [categoryId, setCategoryId] = React.useState<string>("");
  const [date, setDate] = React.useState<string>(todayKey);
  const [note, setNote] = React.useState("");

  const [recurring, setRecurring] = React.useState(false);
  const [dayOfMonth, setDayOfMonth] = React.useState<number>(() => dayFromKey(todayKey()));
  const [dayTouched, setDayTouched] = React.useState(false);
  const [endDate, setEndDate] = React.useState<string>("");

  const [errors, setErrors] = React.useState<Errors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [justAdded, setJustAdded] = React.useState(false);

  const accounts = meta?.accounts ?? [];
  const categories = React.useMemo(
    () =>
      (meta?.categories ?? []).filter((c) =>
        type === "INCOME" ? c.kind === "INCOME" : c.kind === "EXPENSE",
      ),
    [meta?.categories, type],
  );

  // Keep the recurring day in sync with the chosen date until the user overrides it.
  React.useEffect(() => {
    if (!dayTouched) setDayOfMonth(dayFromKey(date));
  }, [date, dayTouched]);

  function changeType(next: EntryType) {
    setType(next);
    setErrors({});
    setJustAdded(false);
    // reset type-specific fields so we never send stale ids
    setFromAccountId("");
    setToAccountId("");
    setCategoryId("");
  }

  function resetForm() {
    setAmount("");
    setFromAccountId("");
    setToAccountId("");
    setCategoryId("");
    setNote("");
    setRecurring(false);
    setEndDate("");
    setDayTouched(false);
    setDate(todayKey());
    setErrors({});
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!isPositiveAmount(amount)) e.amount = "Enter an amount greater than ₹0";

    if (type === "INCOME") {
      if (!toAccountId) e.toAccountId = "Choose the destination account";
      if (!categoryId) e.categoryId = "Choose a category";
    } else if (type === "EXPENSE") {
      if (!fromAccountId) e.fromAccountId = "Choose the source account";
      if (!categoryId) e.categoryId = "Choose a category";
    } else {
      if (!fromAccountId) e.fromAccountId = "Choose the source account";
      if (!toAccountId) e.toAccountId = "Choose the destination account";
      if (fromAccountId && toAccountId && fromAccountId === toAccountId)
        e.toAccountId = "Transfer accounts must differ";
    }
    return e;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    setJustAdded(false);
    try {
      const body = {
        type,
        amount,
        fromAccountId: type === "INCOME" ? null : fromAccountId,
        toAccountId: type === "EXPENSE" ? null : toAccountId,
        categoryId: type === "TRANSFER" ? null : categoryId,
        note: note.trim() ? note.trim() : null,
        occurredAt: date,
        ...(recurring
          ? { recurring: { dayOfMonth, endDate: endDate ? endDate : null } }
          : {}),
      };

      const res = await apiPost<CreateEntryResponse>("/api/entries", body);

      toast.success("Entry added");
      for (const n of res.notifications) toast.warning(n.message);
      if (res.recurringRuleId) toast.success("Recurring rule saved");

      revalidate();
      resetForm();
      setJustAdded(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Something went wrong";
      toast.error(msg || "Failed to add entry");
    } finally {
      setSubmitting(false);
    }
  }

  const accentText =
    type === "INCOME"
      ? "text-success"
      : type === "EXPENSE"
        ? "text-destructive"
        : "text-primary";

  // ----- live preview -----
  const previewMinor = rupeesToMinor(amount);
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? "";
  const previewParts: React.ReactNode[] = [];
  if (previewMinor && previewMinor > 0n) {
    const money = inr(previewMinor);
    if (type === "INCOME" && toAccountId) {
      previewParts.push(
        <span key="p">
          {nameOf(toAccountId)} <span className="tabular text-success">+{money}</span>
        </span>,
      );
    } else if (type === "EXPENSE" && fromAccountId) {
      previewParts.push(
        <span key="p">
          {nameOf(fromAccountId)}{" "}
          <span className="tabular text-destructive">−{money}</span>
        </span>,
      );
    } else if (type === "TRANSFER" && fromAccountId && toAccountId) {
      previewParts.push(
        <span key="p">
          {nameOf(fromAccountId)}{" "}
          <span className="tabular text-destructive">−{money}</span>
          {"  →  "}
          {nameOf(toAccountId)}{" "}
          <span className="tabular text-success">+{money}</span>
        </span>,
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Add entry"
        subtitle="Record income, an expense, or a transfer between accounts."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Form */}
        <Card className="lg:col-span-2">
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* Type switcher */}
              <Tabs value={type} onValueChange={(v) => changeType(v as EntryType)}>
                <TabsList className="grid w-full grid-cols-3">
                  {TYPES.map(({ value, label, Icon }) => (
                    <TabsTrigger key={value} value={value}>
                      <Icon className="size-4" />
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {/* Amount */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="amount">Amount</Label>
                <div className="relative">
                  <span
                    className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold ${accentText}`}
                  >
                    ₹
                  </span>
                  <input
                    id="amount"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => {
                      setAmount(sanitizeAmount(e.target.value));
                      if (errors.amount) setErrors((p) => ({ ...p, amount: undefined }));
                    }}
                    className={`tabular h-16 w-full rounded-xl border bg-card pl-10 pr-4 text-3xl font-semibold shadow-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring/60 ${
                      errors.amount ? "border-destructive" : "border-input focus-visible:border-ring/60"
                    }`}
                  />
                </div>
                {errors.amount && (
                  <p className="text-xs text-destructive">{errors.amount}</p>
                )}
              </div>

              {/* Accounts */}
              <div className="grid gap-4 sm:grid-cols-2">
                {(type === "EXPENSE" || type === "TRANSFER") && (
                  <AccountField
                    label="From account"
                    value={fromAccountId}
                    onChange={(v) => {
                      setFromAccountId(v);
                      setErrors((p) => ({ ...p, fromAccountId: undefined }));
                    }}
                    accounts={accounts}
                    disabled={metaLoading}
                    error={errors.fromAccountId}
                  />
                )}
                {(type === "INCOME" || type === "TRANSFER") && (
                  <AccountField
                    label="To account"
                    value={toAccountId}
                    onChange={(v) => {
                      setToAccountId(v);
                      setErrors((p) => ({ ...p, toAccountId: undefined }));
                    }}
                    accounts={accounts}
                    disabled={metaLoading}
                    error={errors.toAccountId}
                  />
                )}
              </div>

              {/* Category (income/expense only) */}
              {type !== "TRANSFER" && (
                <div className="flex flex-col gap-2">
                  <Label>Category</Label>
                  <Select
                    value={categoryId || undefined}
                    onValueChange={(v) => {
                      setCategoryId(v);
                      setErrors((p) => ({ ...p, categoryId: undefined }));
                    }}
                    disabled={metaLoading}
                  >
                    <SelectTrigger
                      className={errors.categoryId ? "border-destructive" : undefined}
                    >
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.categoryId && (
                    <p className="text-xs text-destructive">{errors.categoryId}</p>
                  )}
                </div>
              )}

              {/* Date + note */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    max={todayKey()}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="note">Note (optional)</Label>
                  <Input
                    id="note"
                    value={note}
                    maxLength={200}
                    placeholder="e.g. Groceries"
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              {/* Recurring */}
              <div className="rounded-xl border border-border bg-secondary/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Repeat className="size-4 text-primary" />
                    <div>
                      <Label htmlFor="recurring" className="cursor-pointer">
                        Make this recurring (monthly)
                      </Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Auto-create this entry every month.
                      </p>
                    </div>
                  </div>
                  <Switch id="recurring" checked={recurring} onCheckedChange={setRecurring} />
                </div>

                {recurring && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="dayOfMonth">Day of month</Label>
                      <Input
                        id="dayOfMonth"
                        type="number"
                        min={1}
                        max={31}
                        value={dayOfMonth}
                        onChange={(e) => {
                          setDayTouched(true);
                          const n = Number(e.target.value);
                          setDayOfMonth(Math.min(31, Math.max(1, Number.isFinite(n) ? n : 1)));
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="endDate">End date (optional)</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={endDate}
                        min={date}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Preview */}
              {previewParts.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Effect:</span>
                  <span className="font-medium">{previewParts}</span>
                </div>
              )}

              {/* Submit */}
              <div className="flex items-center gap-3">
                <Button type="submit" size="lg" disabled={submitting || metaLoading}>
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Adding…
                    </>
                  ) : (
                    "Add entry"
                  )}
                </Button>
                {justAdded && !submitting && (
                  <span className="flex items-center gap-1.5 text-sm text-success">
                    <Check className="size-4" />
                    Added to the ledger
                  </span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Helper */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Info className="size-4 text-primary" />
                Append-only ledger
              </CardTitle>
              <CardDescription>
                Entries can&apos;t be edited or deleted. To fix a mistake, add a reversing
                entry — the original stays for a full audit trail.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="flex flex-col gap-2">
                <li className="flex gap-2">
                  <ArrowDownLeft className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>
                    <span className="text-success">Income</span> lands in the destination
                    account.
                  </span>
                </li>
                <li className="flex gap-2">
                  <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span>
                    <span className="text-destructive">Expense</span> leaves the source
                    account against a category.
                  </span>
                </li>
                <li className="flex gap-2">
                  <ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <span className="text-primary">Transfer</span> moves money between two of
                    your accounts.
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AccountField({
  label,
  value,
  onChange,
  accounts,
  disabled,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  accounts: AccountDTO[];
  disabled?: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={error ? "border-destructive" : undefined}>
          <SelectValue placeholder="Select an account" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
