"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Tiny typed fetch layer + a data hook with global revalidation. Money fields
 * are strings (paise) end-to-end on the client — see lib/format.ts.
 */

// ---------- Shared DTOs (money as string paise) ----------
export type Minor = string;

export type UserDTO = { id: string; name: string; email: string; createdAt: string };
export type AccountDTO = { id: string; name: string; type: string };
export type CategoryDTO = { id: string; name: string; kind: "INCOME" | "EXPENSE" };

export type MeDTO =
  | { user: null }
  | { user: UserDTO; month: string; hasBudget: boolean; hasEntries: boolean };

export type AccountBalanceDTO = AccountDTO & { balanceMinor: Minor };

export type CategorySummaryDTO = {
  categoryId: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  limitMinor: Minor | null;
  spentMinor: Minor;
  remainingMinor: Minor | null;
  pct: number | null;
};

export type SummaryDTO = {
  month: string;
  accounts: AccountBalanceDTO[];
  netWorthMinor: Minor;
  incomeMinor: Minor;
  expenseMinor: Minor;
  overall: { limitMinor: Minor; spentMinor: Minor; remainingMinor: Minor; pct: number };
  categories: CategorySummaryDTO[];
  savings: { targetMinor: Minor; currentMinor: Minor; pct: number };
  biggestCategory: { name: string; spentMinor: Minor } | null;
};

export type EntryDTO = {
  id: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amountMinor: Minor;
  note: string | null;
  occurredAt: string;
  createdAt: string;
  reversesEntryId: string | null;
  recurringRuleId: string | null;
  category: { id: string; name: string; kind: string } | null;
  fromAccount: { id: string; name: string; type: string } | null;
  toAccount: { id: string; name: string; type: string } | null;
  reversedBy: { id: string }[];
};

export type EntriesPageDTO = {
  entries: EntryDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type NotificationDTO = {
  id: string;
  kind: "BUDGET_80" | "BUDGET_100" | "MONTH_SUMMARY";
  message: string;
  read: boolean;
  createdAt: string;
};

export type NotificationsDTO = { notifications: NotificationDTO[]; unreadCount: number };

export type RecurringRuleDTO = {
  id: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amountMinor: Minor;
  note: string | null;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  active: boolean;
  category: { id: string; name: string } | null;
  fromAccount: { id: string; name: string } | null;
  toAccount: { id: string; name: string } | null;
  _count: { entries: number };
};

export type PreferencesDTO = {
  month: string;
  budget:
    | {
        id: string;
        month: string;
        overallLimitMinor: Minor;
        savingsTargetMinor: Minor;
        categoryBudgets: { id: string; categoryId: string; limitMinor: Minor }[];
      }
    | null;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
};

// ---------- fetch helpers ----------
export class ApiError extends Error {
  details?: unknown;
  status: number;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(data?.error ?? res.statusText, res.status, data?.details);
  }
  return data as T;
}

export function apiGet<T>(url: string): Promise<T> {
  return fetch(url, { cache: "no-store" }).then((r) => handle<T>(r));
}

function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  return fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => handle<T>(r));
}

export const apiPost = <T>(url: string, body?: unknown) => send<T>("POST", url, body);
export const apiPut = <T>(url: string, body?: unknown) => send<T>("PUT", url, body);
export const apiPatch = <T>(url: string, body?: unknown) => send<T>("PATCH", url, body);
export const apiDelete = <T>(url: string) => send<T>("DELETE", url);

// ---------- global revalidation ----------
const listeners = new Set<() => void>();
let version = 0;

/** Call after any mutation to refresh all live `useApi` hooks. */
export function revalidate() {
  version++;
  listeners.forEach((fn) => fn());
}

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(url !== null);

  const load = useCallback(() => {
    if (!url) return;
    setLoading(true);
    apiGet<T>(url)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e : new ApiError(String(e), 0)))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => {
    load();
    const fn = () => load();
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, [load]);

  return { data, error, loading, refetch: load, version };
}
