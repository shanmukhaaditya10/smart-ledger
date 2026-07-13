# Smart Mini-Ledger

A single-user personal finance ledger + budgeting tool. It records income, expenses and
transfers, compares actual spending against per-category and monthly budgets, tracks a
savings target, materializes recurring transactions, and notifies you when you approach or
exceed a budget.

The twist: it's **not a CRUD expense list**. It's a real ledger — **immutable,
integer-money, double-entry**, with balances and budget usage **derived** from entries
(never stored), a live budget-vs-actual loop that drives notifications, and **idempotent**
recurring transactions.

---

## What it does

- **First-open** → collects name + email (no password, single-user) and seeds default
  accounts (Cash / Bank / Card / Savings) and the fixed category set.
- **Onboarding** (skippable) → monthly salary, overall budget, per-category budgets, savings
  target. The salary is written as a *real* income entry so the ledger reconciles.
- **Dashboard** → net worth + account balances (animated count-up), overall budget bar,
  per-category budget bars, savings-target ring, a spend-by-category donut, and a
  budget-vs-actual bar chart. Notification bell.
- **Add entry** → income / expense / transfer, with an optional "make this recurring" toggle.
- **Transactions** → filter by month / category / type, paginated, with a **reverse** action
  (appends a reversing entry — never a hard delete).
- **Recurring** → CRUD for monthly rules + a "Run now" materializer.
- **Profile** → edit budgets, targets and category limits for any month.
- Light / dark theme, fully responsive (desktop sidebar → mobile bottom-tab bar).

---

## Run it

### Option A — one command (Docker: app + Postgres)

```bash
docker compose up --build
```

This starts Postgres, waits for it to be healthy, applies migrations, seeds a demo user
(`demo@smartledger.app`), and serves the app. Then open **http://localhost:3000** and sign in
with any name + the seeded email (or a brand-new email to start fresh).

Start empty instead of seeded: set `SEED=false` in `docker-compose.yml`.

### Option B — local dev

```bash
# 1. Start just Postgres
docker compose up -d postgres

# 2. Install deps + set env
pnpm install
cp .env.example .env        # DATABASE_URL already points at the compose Postgres

# 3. Migrate + seed
pnpm db:deploy              # or: pnpm db:migrate  (dev migrations)
pnpm seed

# 4. Run
pnpm dev                    # http://localhost:3000
```

**Re-seed a different profile:** edit the `CONFIG` block at the top of
[`prisma/seed.ts`](prisma/seed.ts) (salary, budgets, savings target, months) and run
`pnpm seed` again. The seed resets the demo user each run and uses a fixed random seed, so
data is realistic *and* reproducible.

### Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev / prod build / prod serve |
| `pnpm db:migrate` / `pnpm db:deploy` | Prisma migrations (dev / deploy) |
| `pnpm db:reset` | Drop + re-create + re-migrate the DB |
| `pnpm seed` | Seed the reproducible demo dataset |
| `pnpm lint` / `pnpm exec tsc --noEmit` | Lint / typecheck |

---

## Tech stack

Next.js 16 (App Router) + TypeScript · PostgreSQL + **Prisma 7** (driver-adapter / `pg`) ·
Tailwind CSS v4 + a small shadcn-style component layer · Framer Motion (count-up, ring fill,
page transitions) · Recharts (2 charts) · Zod (every mutation) · pnpm · Docker.

---

## Architecture — and *why*

### 1. Money is integer minor units (paise), never floats

Every amount in the DB and in business logic is a `BigInt` of paise. Rupee strings are parsed
to integer paise **at the validation edge** ([`lib/money.ts`](src/lib/money.ts) +
[`lib/validation.ts`](src/lib/validation.ts)) and converted back to rupees only for display.
There is no `parseFloat` on money anywhere. Floating point can't represent decimal currency
exactly — `0.1 + 0.2 !== 0.3` — so any float-based ledger silently drifts. Integers can't.

Because `BigInt` can't cross JSON, the API serializes money as a **decimal string of paise**
([`lib/http.ts`](src/lib/http.ts)) and the client re-parses with `BigInt(...)` before
formatting, reusing the *same* formatter as the server so display never diverges.

### 2. The ledger is append-only and immutable

`Entry` rows are never `UPDATE`d or `DELETE`d. A "delete" or "edit" is a new **reversing
entry** (`reversesEntryId`) that mirrors the original and whose effect on every derived number
is simply negated ([`lib/entries.ts`](src/lib/entries.ts)). The original stays for a full,
auditable history. Reversing an expense credits the account back *and* reduces that category's
spend — without mutating a single existing row.

### 3. Balances and budget usage are *derived*, never stored

There is no running-balance column. Account balances, net worth, category spend and budget
remaining are all recomputed from `Entry` rows on read ([`lib/ledger.ts`](src/lib/ledger.ts)):

```
balance(account) = Σ credits − Σ debits          (reversals negated)
  credits = INCOME.toAccount + TRANSFER.toAccount
  debits  = EXPENSE.fromAccount + TRANSFER.fromAccount
net worth = Σ balances
category spend = Σ EXPENSE in month, by category  (reversals negated)
```

A stored total is a second source of truth that *will* drift (a missed increment, a partial
failure, a concurrent write). Deriving from history means the numbers are correct by
construction.

### 4. A transfer is not an expense

Moving ₹20,000 to Savings does not reduce net worth — it debits one account and credits
another. Transfers are a distinct `EntryType` with both `fromAccountId` and `toAccountId` set
and **no category**, so they never appear in expense totals or budget usage.

### 5. Notifications ride the derived budget loop

On every new expense, the affected category's spend and the overall spend are recomputed and
compared to their limits ([`lib/budget.ts`](src/lib/budget.ts)). Crossing 80% raises a
`BUDGET_80`, crossing 100% a `BUDGET_100`. Each alert carries a deterministic `dedupeKey`
(e.g. `budget100:2026-07:cat:<id>`) with a unique constraint, so it fires **at most once per
month per scope** — no spam, even when later expenses re-cross the line.

### 6. Recurring generation is idempotent

No cron, no scheduler ([`lib/recurring.ts`](src/lib/recurring.ts)). On app load (and via
`POST /api/recurring/run`), a materializer generates any missing entries from each rule's
start up to today. Every generated entry gets a deterministic `dedupeKey`
(`rule:{ruleId}:{YYYY-MM}`) with a unique constraint, so calling run twice — or the seed
pre-creating an entry with the same key — can **never** double-insert.

### Data model

`User · Account · Category · Entry (the ledger) · Budget · CategoryBudget · RecurringRule ·
Notification`. See [`prisma/schema.prisma`](prisma/schema.prisma). Money columns are `BigInt`;
`Entry.dedupeKey` and `Notification.dedupeKey` are uniquely constrained (the idempotency
backbone); deleting a `User` cascades to all their data.

### API

Route handlers under [`src/app/api`](src/app/api): `POST /api/user`, `GET/PUT
/api/preferences`, `POST/GET /api/entries`, `POST /api/entries/:id/reverse`, `GET
/api/summary`, `GET /api/notifications` + `POST /api/notifications/:id/read`, `POST/GET/PUT/
PATCH/DELETE /api/recurring` + `POST /api/recurring/run`, and the stretch `POST
/api/summary/email`. Every mutation is Zod-validated.

---

## AI section (required by the brief)

**Tools used.** This project was built with an AI coding agent (Claude Code) driving the
implementation, with a human directing architecture, reviewing every design decision, and
verifying behavior. AI sped up the mechanical 80%: scaffolding route handlers, wiring the
shadcn-style component layer, generating the Recharts config, and drafting the reproducible
seed. UI pages were built in parallel by sub-agents against a fixed component + API contract.
The app was verified end-to-end by driving real Chrome with Puppeteer (screenshots of every
page in light/dark/mobile, asserting **zero console errors**) plus a scripted ledger loop.

**Where AI got it wrong and human judgment fixed it** — honest, specific:

- **Money as floats.** The naive first instinct (and the default an off-the-shelf scaffold
  reaches for) is `amount: number` and `parseFloat(input)`. Rejected — money is `BigInt` paise
  end-to-end, parsed from strings with no float ever touching it. This is the single most
  important correctness decision in the app.
- **A stored running-balance column.** Tempting for "fast reads," but it's a second source of
  truth that drifts. Rejected in favor of balances **derived** from `Entry` on every read.
- **Recurring generation that double-inserts on re-run.** A straightforward "for each rule,
  insert this month's entry" double-counts the moment `run` is called twice (app load + manual).
  Fixed with a deterministic `dedupeKey` + a unique constraint so generation is idempotent.
- **Logging a savings transfer as an expense.** Modeling "move to savings" as an expense would
  wrongly shrink net worth and eat into budgets. Fixed by modeling `TRANSFER` as a distinct
  entry type that touches two accounts and no category.
- **Foreign-key cascade bug, caught in verification.** Re-running the seed initially crashed:
  deleting the demo user cascaded to categories/accounts, but `CategoryBudget`, `Entry` and
  `RecurringRule` referenced them with the default `RESTRICT`, so Postgres blocked the delete.
  The automated re-seed check surfaced it; fixed by setting explicit `onDelete` actions
  (see the `cascade_on_user_delete` migration).
- **Framework assumptions from stale training data.** Prisma 7 moved to a WASM query compiler
  with a required driver adapter, a `prisma.config.ts`, and a generated client under
  `src/generated` — not the `@prisma/client` singleton patterns the model assumed. The repo's
  own guidance (read the bundled Next.js docs; heed Prisma's new conventions) beat memory.

---

## What I'd do next (production notes)

- **Real auth** (NextAuth / Auth.js) + per-user data isolation instead of a single-user cookie.
- **Scheduled monthly email** via a proper job runner (the summary + send logic already exists
  at [`lib/report.ts`](src/lib/report.ts) / [`lib/email.ts`](src/lib/email.ts), env-gated and
  triggerable at `POST /api/summary/email`); today it's manual by design.
- **Multi-currency** (store currency + minor-unit scale per amount).
- **DB-level guards** for append-only (a trigger/`REVOKE UPDATE,DELETE` on `Entry`) to enforce
  immutability even outside the app.
- Custom categories/accounts, CSV import, and per-account opening balances.
