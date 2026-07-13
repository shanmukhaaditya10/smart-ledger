"use client";

import * as React from "react";
import {
  Repeat,
  Plus,
  Play,
  Pencil,
  Trash2,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useApi,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  revalidate,
  type RecurringRuleDTO,
  type AccountDTO,
  type CategoryDTO,
} from "@/lib/client";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { TypeBadge } from "@/components/app/type-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type EntryType = "INCOME" | "EXPENSE" | "TRANSFER";
type MetaDTO = { accounts: AccountDTO[]; categories: CategoryDTO[] };

const NO_CATEGORY = "__none__";
const TYPES: { value: EntryType; label: string }[] = [
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
  { value: "TRANSFER", label: "Transfer" },
];

// paise string -> plain rupee decimal for the amount input (no grouping commas).
function minorToRupeeInput(minor: string): string {
  const b = BigInt(minor);
  const neg = b < 0n;
  const abs = neg ? -b : b;
  const r = abs / 100n;
  const p = abs % 100n;
  return `${neg ? "-" : ""}${r}.${p.toString().padStart(2, "0")}`;
}

function todayInput(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const amountToneFor = (type: EntryType) =>
  type === "INCOME"
    ? "text-success"
    : type === "EXPENSE"
      ? "text-destructive"
      : "text-primary";

export default function RecurringPage() {
  const { data, loading } = useApi<{ rules: RecurringRuleDTO[] }>("/api/recurring");
  const { data: meta } = useApi<MetaDTO>("/api/meta");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RecurringRuleDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<RecurringRuleDTO | null>(null);
  const [running, setRunning] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const rules = data?.rules ?? [];

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(rule: RecurringRuleDTO) {
    setEditing(rule);
    setDialogOpen(true);
  }

  async function runNow() {
    setRunning(true);
    try {
      const res = await apiPost<{ createdCount: number }>("/api/recurring/run");
      if (res.createdCount > 0) {
        toast.success(
          `Added ${res.createdCount} ${res.createdCount === 1 ? "entry" : "entries"}`,
        );
      } else {
        toast.info("Nothing due");
      }
      revalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to run rules");
    } finally {
      setRunning(false);
    }
  }

  async function toggleActive(rule: RecurringRuleDTO, active: boolean) {
    setTogglingId(rule.id);
    try {
      await apiPatch(`/api/recurring/${rule.id}`, { active });
      toast.success(active ? "Rule resumed" : "Rule paused");
      revalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update rule");
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/recurring/${deleteTarget.id}`);
      toast.success("Rule deleted");
      revalidate();
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete rule");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Recurring rules"
        subtitle="Automate monthly income, bills, and transfers. Runs are idempotent — a rule generates each month's entry at most once."
        actions={
          <>
            <Button variant="outline" onClick={runNow} disabled={running}>
              {running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Run now
            </Button>
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              New rule
            </Button>
          </>
        }
      />

      {loading ? (
        <ListSkeleton />
      ) : rules.length === 0 ? (
        <EmptyState
          icon={<Repeat className="size-6" />}
          title="No recurring rules yet"
          description="Set up a rule to automatically post salary, rent, subscriptions, or a monthly transfer."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              New rule
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              toggling={togglingId === rule.id}
              onToggle={(active) => toggleActive(rule, active)}
              onEdit={() => openEdit(rule)}
              onDelete={() => setDeleteTarget(rule)}
            />
          ))}
        </div>
      )}

      <RuleDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rule={editing}
        accounts={meta?.accounts ?? []}
        categories={meta?.categories ?? []}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this rule?</DialogTitle>
            <DialogDescription>
              This stops future entries from being generated. Entries already
              posted are kept and simply detached from the rule.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete rule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RuleRow({
  rule,
  toggling,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: RecurringRuleDTO;
  toggling: boolean;
  onToggle: (active: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const account = rule.type === "INCOME" ? rule.toAccount : rule.fromAccount;
  const summary =
    rule.type === "TRANSFER" ? (
      <span className="inline-flex items-center gap-1">
        {rule.fromAccount?.name ?? "—"}
        <ArrowRight className="size-3.5" />
        {rule.toAccount?.name ?? "—"}
      </span>
    ) : (
      [rule.category?.name, account?.name].filter(Boolean).join(" · ") || "—"
    );

  return (
    <Card className={`p-4 transition-opacity ${rule.active ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={rule.type} />
            <span className="truncate font-medium">
              {rule.note?.trim() || "Untitled rule"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>Monthly · day {rule.dayOfMonth}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{summary}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {rule._count.entries} generated
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className={`tabular font-semibold ${amountToneFor(rule.type)}`}>
            {inr(rule.amountMinor)}
          </div>
          <div className="flex items-center gap-1">
            <Switch
              checked={rule.active}
              disabled={toggling}
              onCheckedChange={onToggle}
              aria-label={rule.active ? "Pause rule" : "Resume rule"}
            />
            <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit rule">
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              aria-label="Delete rule"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function RuleDialog({
  open,
  onOpenChange,
  rule,
  accounts,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: RecurringRuleDTO | null;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
}) {
  const [type, setType] = React.useState<EntryType>(rule?.type ?? "EXPENSE");
  const [amount, setAmount] = React.useState(
    rule ? minorToRupeeInput(rule.amountMinor) : "",
  );
  const [categoryId, setCategoryId] = React.useState(rule?.category?.id ?? NO_CATEGORY);
  const [fromAccountId, setFromAccountId] = React.useState(rule?.fromAccount?.id ?? "");
  const [toAccountId, setToAccountId] = React.useState(rule?.toAccount?.id ?? "");
  const [note, setNote] = React.useState(rule?.note ?? "");
  const [dayOfMonth, setDayOfMonth] = React.useState(String(rule?.dayOfMonth ?? 1));
  const [startDate, setStartDate] = React.useState(
    rule ? rule.startDate.slice(0, 10) : todayInput(),
  );
  const [endDate, setEndDate] = React.useState(
    rule?.endDate ? rule.endDate.slice(0, 10) : "",
  );
  const [active, setActive] = React.useState(rule?.active ?? true);
  const [submitting, setSubmitting] = React.useState(false);

  const categoryKind = type === "INCOME" ? "INCOME" : "EXPENSE";
  const categoryOptions = categories.filter((c) => c.kind === categoryKind);

  function changeType(next: EntryType) {
    setType(next);
    setCategoryId(NO_CATEGORY); // avoid a stale category from the other kind
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount.trim()) {
      toast.error("Enter an amount");
      return;
    }
    const day = Number(dayOfMonth);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      toast.error("Day of month must be between 1 and 31");
      return;
    }
    if ((type === "INCOME" || type === "TRANSFER") && !toAccountId) {
      toast.error("Choose a destination account");
      return;
    }
    if ((type === "EXPENSE" || type === "TRANSFER") && !fromAccountId) {
      toast.error("Choose a source account");
      return;
    }

    const body: Record<string, unknown> = {
      type,
      amount: amount.trim(),
      note: note.trim() || null,
      dayOfMonth: day,
      startDate,
      endDate: endDate || null,
      active,
    };
    if (type === "TRANSFER") {
      body.fromAccountId = fromAccountId;
      body.toAccountId = toAccountId;
    } else if (type === "INCOME") {
      body.toAccountId = toAccountId;
      body.categoryId = categoryId !== NO_CATEGORY ? categoryId : null;
    } else {
      body.fromAccountId = fromAccountId;
      body.categoryId = categoryId !== NO_CATEGORY ? categoryId : null;
    }

    setSubmitting(true);
    try {
      if (rule) {
        await apiPut(`/api/recurring/${rule.id}`, body);
        toast.success("Rule updated");
      } else {
        await apiPost("/api/recurring", body);
        toast.success("Rule created");
      }
      revalidate();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save rule");
    } finally {
      setSubmitting(false);
    }
  }

  const showCategory = type !== "TRANSFER";
  const showFrom = type === "EXPENSE" || type === "TRANSFER";
  const showTo = type === "INCOME" || type === "TRANSFER";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "New recurring rule"}</DialogTitle>
          <DialogDescription>
            Posts automatically each month. Runs are idempotent — at most one
            entry per month.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Type switcher */}
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-secondary/50 p-1">
            {TYPES.map((t) => {
              const activeType = type === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => changeType(t.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeType
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dayOfMonth">Day of month</Label>
              <Input
                id="dayOfMonth"
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            </div>
          </div>

          {showFrom && (
            <div className="flex flex-col gap-1.5">
              <Label>From account</Label>
              <Select value={fromAccountId} onValueChange={setFromAccountId}>
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
          )}

          {showTo && (
            <div className="flex flex-col gap-1.5">
              <Label>To account</Label>
              <Select value={toAccountId} onValueChange={setToAccountId}>
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
          )}

          {showCategory && (
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endDate">End date (optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">Note (optional)</Label>
            <Input
              id="note"
              placeholder="e.g. Monthly rent"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-xs text-muted-foreground">
                Paused rules generate nothing until resumed.
              </div>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {rule ? "Save changes" : "Create rule"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
          </div>
        </Card>
      ))}
    </div>
  );
}
