"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, ChevronLeft, ChevronRight, Undo2, Receipt, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import {
  useApi,
  apiPost,
  revalidate,
  ApiError,
  type EntriesPageDTO,
  type EntryDTO,
  type CategoryDTO,
  type AccountDTO,
} from "@/lib/client";
import { inr, formatDateShort } from "@/lib/format";
import { useMonth } from "@/components/app/month-context";
import { PageHeader } from "@/components/app/page-header";
import { TypeIcon } from "@/components/app/type-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

const PAGE_SIZE = 20;

type MetaDTO = { accounts: AccountDTO[]; categories: CategoryDTO[] };
type TypeFilter = "ALL" | "INCOME" | "EXPENSE" | "TRANSFER";

const TYPE_TABS: { value: TypeFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
  { value: "TRANSFER", label: "Transfer" },
];

export default function TransactionsPage() {
  const { month } = useMonth();
  const [type, setType] = React.useState<TypeFilter>("ALL");
  const [categoryId, setCategoryId] = React.useState<string>("all");
  const [page, setPage] = React.useState(1);

  // Reset to first page whenever the month or a filter changes.
  React.useEffect(() => {
    setPage(1);
  }, [month, type, categoryId]);

  const { data: meta } = useApi<MetaDTO>("/api/meta");

  const entriesUrl = React.useMemo(() => {
    const params = new URLSearchParams({
      month,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (type !== "ALL") params.set("type", type);
    if (categoryId !== "all") params.set("categoryId", categoryId);
    return `/api/entries?${params.toString()}`;
  }, [month, type, categoryId, page]);

  const { data, loading } = useApi<EntriesPageDTO>(entriesUrl);

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Transactions"
        subtitle={total > 0 ? `${total} ${total === 1 ? "entry" : "entries"} this period` : "Your ledger, append-only"}
        actions={
          <Button asChild size="sm">
            <Link href="/add">
              <Plus className="size-4" />
              Add
            </Link>
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={type} onValueChange={(v) => setType(v as TypeFilter)}>
          <TabsList className="w-full sm:w-auto">
            {TYPE_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-1 sm:flex-none">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(meta?.categories ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading && !data ? (
        <SkeletonList />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-5" />}
          title="No transactions"
          description="Nothing matches these filters yet. Add your first entry to get started."
          action={
            <Button asChild>
              <Link href="/add">
                <Plus className="size-4" />
                Add transaction
              </Link>
            </Button>
          }
        />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} />
          ))}
        </Card>
      )}

      {/* Pagination */}
      {entries.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data?.page ?? page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={(data?.page ?? page) <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(data?.page ?? page) >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry }: { entry: EntryDTO }) {
  const isReversal = entry.reversesEntryId != null;
  const isReversed = entry.reversedBy.length > 0;
  const isAuto = entry.recurringRuleId != null;
  const muted = isReversal || isReversed;

  const title = entry.note?.trim() || entry.category?.name || typeLabel(entry.type);

  return (
    <div className={`flex items-center gap-3 p-4 ${muted ? "opacity-60" : ""}`}>
      <TypeIcon type={entry.type} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium">{title}</span>
          {isReversal && (
            <Badge variant="secondary" className="shrink-0">
              Reversal
            </Badge>
          )}
          {isReversed && (
            <Badge variant="outline" className="shrink-0">
              Reversed
            </Badge>
          )}
          {isAuto && (
            <Badge variant="default" className="shrink-0">
              Auto
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{metaLine(entry)}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <AmountLabel entry={entry} strike={muted} />
        <span className="text-xs text-muted-foreground">{formatDateShort(entry.occurredAt)}</span>
      </div>

      {/* Reverse action only for a live, un-reversed, non-reversal entry. */}
      {!isReversal && !isReversed && <ReverseAction entry={entry} />}
    </div>
  );
}

function AmountLabel({ entry, strike }: { entry: EntryDTO; strike: boolean }) {
  const base = inr(entry.amountMinor);
  const tone =
    entry.type === "INCOME"
      ? "text-success"
      : entry.type === "EXPENSE"
        ? "text-destructive"
        : "text-primary";
  const text =
    entry.type === "INCOME" ? `+${base}` : entry.type === "EXPENSE" ? `−${base}` : base;
  return (
    <span className={`tabular font-semibold ${tone} ${strike ? "line-through" : ""}`}>{text}</span>
  );
}

function ReverseAction({ entry }: { entry: EntryDTO }) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  async function onReverse() {
    setSubmitting(true);
    try {
      await apiPost(`/api/entries/${entry.id}/reverse`);
      toast.success("Entry reversed");
      revalidate();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not reverse entry");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Reverse entry" title="Reverse">
          <Undo2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reverse this entry?</DialogTitle>
          <DialogDescription>
            This appends a reversing entry; the original is never deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-secondary/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-sm font-medium">
              {entry.note?.trim() || entry.category?.name || typeLabel(entry.type)}
            </span>
            <AmountLabel entry={entry} strike={false} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{metaLine(entry)}</p>
        </div>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={onReverse} disabled={submitting}>
            {submitting ? "Reversing…" : "Reverse entry"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function metaLine(entry: EntryDTO): React.ReactNode {
  if (entry.type === "TRANSFER") {
    return (
      <span className="inline-flex items-center gap-1">
        {entry.fromAccount?.name ?? "—"}
        <ArrowRight className="size-3" />
        {entry.toAccount?.name ?? "—"}
      </span>
    );
  }
  // INCOME lands in an account; EXPENSE leaves one.
  const account = entry.type === "INCOME" ? entry.toAccount : entry.fromAccount;
  const parts = [entry.category?.name, account?.name].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : typeLabel(entry.type);
}

function typeLabel(type: EntryDTO["type"]): string {
  return type === "INCOME" ? "Income" : type === "EXPENSE" ? "Expense" : "Transfer";
}

function SkeletonList() {
  return (
    <Card className="divide-y divide-border overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </Card>
  );
}
