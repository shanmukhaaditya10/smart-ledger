# Smart Mini-Ledger — Build Spec

A single-user personal finance ledger + budgeting tool. Records income/expenses,
compares actual spending against per-category and monthly budgets, tracks a savings
target, supports recurring transactions, and notifies the user when they approach or
exceed a budget. Built as an **immutable, integer-money, double-entry ledger** where
balances and summaries are *derived* from entries, never stored directly.

This is a hiring take-home. Priorities, in order: **money correctness > clear structure
> product polish > breadth of features.** Do not add scope beyond this doc.

---

## 1. Tech stack (fixed — do not substitute)

- **Next.js (App Router) + TypeScript** — one repo, frontend + backend (route handlers).
- **PostgreSQL + Prisma** for persistence.
- **Tailwind CSS + shadcn/ui** for UI.
- **Framer Motion** for tasteful animation only (page transitions, number count-up,
  progress-bar fills). Do not rathole on animation.
- **Recharts** for charts.
- **Zod** for input validation on every mutation.
- Package manager: pnpm. Node version pinned via `.nvmrc`.
- Provide a **Dockerfile + docker-compose** (app + postgres) so it runs with one command.

No React Native. No third-party auth provider.

---

## 2. Core principles (these are the whole point — enforce them everywhere)

1. **Money is stored as integers (paise), never floats.** All amounts in the DB and in
   business logic are `BigInt`/integer minor units. Convert to rupees only at the display
   edge. Never use `parseFloat` on money.
2. **The ledger is append-only and immutable.** Entries are never edited or deleted.
   A "correction" or "delete" is a new reversing entry. This keeps history auditable.
3. **Balances and budget usage are derived**, computed from entries via queries — never
   stored as a mutable running total that can drift.
4. **Every write is idempotent where it can be** (esp. recurring generation): a unique
   key prevents the same logical entry from being created twice.
5. **A transfer is not an expense.** Moving money to Savings does not reduce net worth;
   it debits one account and credits another. Model transfers as a distinct entry type.

---

## 3. Data model (Prisma)

Design tables around these entities. Exact fields can be refined, but keep the shape.

- **User** — `id`, `name`, `email`. (First-open form collects name + email. No password.)
- **Account** — `id`, `userId`, `name`, `type` (`CASH` | `BANK` | `CARD` | `SAVINGS`).
  Seed a default set on onboarding.
- **Category** — `id`, `userId`, `name`, `kind` (`INCOME` | `EXPENSE`). Seed a fixed set
  (Salary, Rent, Food, Transport, Utilities, Entertainment, Savings, Misc).
- **Entry** (the ledger — append-only) — `id`, `userId`, `type` (`INCOME` | `EXPENSE` |
  `TRANSFER`), `amountMinor` (BigInt, always positive), `fromAccountId` (nullable),
  `toAccountId` (nullable), `categoryId` (nullable for transfers), `note`, `occurredAt`,
  `createdAt`, `reversesEntryId` (nullable — set when this entry reverses another),
  `recurringRuleId` (nullable), `dedupeKey` (nullable, unique — used by recurring gen).
  - INCOME: `toAccountId` set, `fromAccountId` null.
  - EXPENSE: `fromAccountId` set, `toAccountId` null.
  - TRANSFER: both set (e.g. Cash → Savings).
- **Budget** — `id`, `userId`, `month` (e.g. `2026-07`), `overallLimitMinor`,
  `savingsTargetMinor`. One per user per month.
- **CategoryBudget** — `id`, `budgetId`, `categoryId`, `limitMinor`.
- **RecurringRule** — `id`, `userId`, `type`, `amountMinor`, `categoryId`,
  `fromAccountId`/`toAccountId`, `note`, `cadence` (`MONTHLY` for v1), `dayOfMonth`,
  `startDate`, `endDate` (nullable), `active`.
- **Notification** — `id`, `userId`, `kind` (`BUDGET_80` | `BUDGET_100` | `MONTH_SUMMARY`),
  `message`, `read`, `createdAt`, `dedupeKey` (unique — don't spam the same alert twice).

---

## 4. Derived queries (server-side, the interesting part)

- **Account balance** = sum(credits to account) − sum(debits from account), computed from
  Entry. Credits = INCOME.toAccount + TRANSFER.toAccount. Debits = EXPENSE.fromAccount +
  TRANSFER.fromAccount.
- **Net worth** = sum of all account balances.
- **Category spend this month** = sum(amountMinor) of EXPENSE entries in the month,
  grouped by category, minus any reversing entries.
- **Budget remaining** = CategoryBudget.limit − category spend. Same for overall.
- **Savings progress** = current SAVINGS account balance vs `savingsTargetMinor`.

All of these are queries over Entry. No stored running totals.

---

## 5. API (route handlers under `/app/api`)

- `POST /api/user` — create/get user by email (first-open).
- `GET/PUT /api/preferences` — read/update budget, category budgets, savings target,
  accounts. (Profile page uses this — preferences are editable anytime.)
- `POST /api/entries` — add income/expense/transfer (Zod-validated). Triggers budget check.
- `GET /api/entries` — list with month + category + type filters, paginated.
- `POST /api/entries/:id/reverse` — append a reversing entry (this is "delete/edit").
- `GET /api/summary?month=YYYY-MM` — balances, net worth, per-category spend vs budget,
  savings progress.
- `GET /api/notifications` / `POST /api/notifications/:id/read`.
- `POST /api/recurring` (CRUD) — manage recurring rules.
- `POST /api/recurring/run` — materialize any due recurring entries up to today
  (see §7). Safe to call repeatedly (idempotent).

---

## 6. Notifications (wired to budgets — this is the required "notification feature")

On every new EXPENSE entry, recompute that category's spend and the overall spend, then:
- If usage crosses **80%** of a limit → create a `BUDGET_80` notification.
- If usage crosses **100%** → create a `BUDGET_100` notification.
- Use `dedupeKey` (e.g. `budget80:2026-07:food`) so each alert fires once per month.

Surface notifications as an in-app bell + toast. Optionally add PWA web-push as a stretch.
**Do not build an email service for this loop** — email is only for the monthly summary (§8).

---

## 7. Recurring transactions (Netflix-style) — keep it simple, NO cron infra

Do **not** install pg_cron or a real scheduler. Instead:
- Store `RecurringRule`s.
- On app load (and via `POST /api/recurring/run`), run a materializer that, for each active
  rule, generates any missing entries from `startDate`/last-run up to today.
- Each generated entry gets a deterministic `dedupeKey` like `rule:{ruleId}:2026-07` and the
  unique constraint guarantees it's created **at most once**, even if run is called twice.
- Optionally add `node-cron` inside the Next server to call the materializer daily, but the
  idempotent on-load run is enough to demo it. Emphasize the idempotency in the README.

---

## 8. Monthly summary email (stretch — build LAST)

- A function that builds a month's report: total income, total expense, per-category
  actual-vs-budget, savings target hit/missed, biggest category.
- Send via a provider (Resend or nodemailer to a test inbox). Gate behind an env var so the
  app runs without email configured.
- Trigger: a manual `POST /api/summary/email?month=...` is fine for the demo; mention how
  you'd schedule it monthly in production. Also drop a `MONTH_SUMMARY` in-app notification.

---

## 9. Seed / dummy data pipeline

- A `pnpm seed` script that creates a demo user with realistic, **preference-driven** data:
  reads a small config (salary, budgets, savings target) and generates a month or two of
  varied entries (a salary credit, rent, groceries across days, a couple of transfers to
  savings, one recurring Netflix rule already materialized).
- Amounts vary but are seeded from a fixed random seed so runs are reproducible.
- Make salary/budgets in the seed config easy to change so a reviewer can re-seed a
  different profile. This doubles as your "it works end-to-end" demo state.

---

## 10. Pages (frontend)

- **First open** — name + email form → creates user.
- **Onboarding (skippable)** — monthly income/salary, overall monthly budget, per-category
  budgets, savings target. Skipping is allowed; defaults apply and it's editable later.
  The salary entered here seeds a real INCOME entry so the ledger reconciles.
- **Dashboard** — net worth + account balances (with count-up animation), overall
  budget-vs-actual progress bar, per-category budget bars, savings-target ring, a
  spend-by-category donut, and a budget-vs-actual bar chart. Notification bell.
- **Add entry** — form: type (income/expense/transfer), amount, category, account(s),
  date, note, "make this recurring" toggle → creates a RecurringRule.
- **Transactions list** — filterable by month/category/type, paginated, with a "reverse"
  action (appends a reversing entry, never hard-deletes).
- **Profile / preferences** — edit everything from onboarding anytime.

Keep it responsive and clean. Two charts max. Animation: subtle only.

---

## 11. Explicit non-goals (do NOT build)

- No login/passwords/OAuth. No multi-user or admin views.
- No real cron/pg_cron. No microservices. No React Native.
- No custom-category creation in v1 (fixed seeded set).
- No multi-currency. Rupees only.
- No hard deletes or in-place edits of entries.

---

## 12. Build order (each phase leaves something demoable)

1. Project setup: Next.js + TS + Tailwind + Prisma + Postgres + Docker. `.env.example`.
2. Data model + migrations + integer-money helpers (parse/format, all math in minor units).
3. Entry creation (income/expense/transfer) + append-only + reverse + derived balances.
4. Categories + monthly budget + per-category budget + savings target + summary endpoint.
5. Dashboard UI with balances, budget bars, savings ring.
6. Transactions list + filters + reverse action.
7. Budget-threshold notifications (80%/100%, deduped) + in-app bell/toast.
8. Recurring rules + idempotent materializer.
9. Charts + animation polish + responsive pass.
10. Seed pipeline.
11. (Stretch) Monthly summary email + PWA push.
12. README (see below).

---

## 13. README requirements (this is graded as much as the code)

- What it does + how to run (docker-compose up, seed, open).
- Architecture: why append-only integer-money double-entry, why balances are derived.
- **The AI section (required by the brief):** which AI tools were used and where they sped
  things up — AND concrete places the AI got it wrong that human judgment fixed. Have real
  examples ready, e.g.: AI represented money as floats / used `parseFloat` (fixed by moving
  to integer minor units); AI suggested a stored running-balance column (rejected in favour
  of derived balances to prevent drift); AI's recurring logic could double-insert on re-run
  (fixed with a deterministic `dedupeKey` + unique constraint); AI logged a savings transfer
  as an expense (fixed by modeling transfers separately). Keep these honest and specific.
- A short "what I'd do next / production notes": real auth via NextAuth, scheduled email via
  a proper job runner, multi-currency, per-user accounts.

---

## 14. The one-line pitch of the twist

It's not a CRUD expense list — it's a **real ledger**: immutable, integer-money,
double-entry, with derived balances, a live budget-vs-actual loop that drives notifications,
and idempotent recurring transactions. That's the depth an off-the-shelf AI scaffold wouldn't
produce on its own.
