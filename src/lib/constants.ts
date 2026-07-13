import type { AccountType, CategoryKind } from "@/generated/prisma/enums";

/** Cookie that holds the current (single) user's id. */
export const USER_COOKIE = "ledger_uid";

/** Default accounts seeded on onboarding. */
export const DEFAULT_ACCOUNTS: { name: string; type: AccountType }[] = [
  { name: "Cash", type: "CASH" },
  { name: "Bank", type: "BANK" },
  { name: "Card", type: "CARD" },
  { name: "Savings", type: "SAVINGS" },
];

/** The Savings account is the transfer target for savings-target tracking. */
export const SAVINGS_ACCOUNT_NAME = "Savings";

/** Fixed seeded category set (no custom categories in v1). */
export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind }[] = [
  { name: "Salary", kind: "INCOME" },
  { name: "Rent", kind: "EXPENSE" },
  { name: "Food", kind: "EXPENSE" },
  { name: "Transport", kind: "EXPENSE" },
  { name: "Utilities", kind: "EXPENSE" },
  { name: "Entertainment", kind: "EXPENSE" },
  { name: "Savings", kind: "EXPENSE" },
  { name: "Misc", kind: "EXPENSE" },
];

export const BUDGET_WARN_PCT = 80;
export const BUDGET_OVER_PCT = 100;
