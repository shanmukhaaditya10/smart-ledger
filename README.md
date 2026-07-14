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

This starts Postgres, waits for it to be healthy, applies migrations, seeds a demo user, and
serves the app. Then open **http://localhost:3000** and sign in with:

> **Name:** `Test`  **Email:** `test@gmail.com`

(or enter a brand-new email to start from an empty ledger and walk through onboarding).

Start empty instead of seeded: set `SEED=false` in `docker-compose.yml`.

### What's in the demo (so you can see every feature)

Signing in as `test@gmail.com` loads **3 months** of realistic data. Things to look at:

- **Dashboard** — net worth derived from the ledger, an overall budget bar, a savings-target
  ring (~59% of ₹3,00,000), a spend-by-category donut, and a budget-vs-actual chart. Note the
  **bell** shows 2 alerts (Food near its limit, Entertainment over 80%).
- **Recurring** — three self-explanatory rules, all live:
  - **Netflix subscription** — a plain *fixed* ₹649 every month.
  - **Clear credit card on payday** — an *auto payoff*: on day 1 it moves *exactly what the
    Card owes* from Bank, so the card gets zeroed each cycle (it still shows this month's
    fresh spend). The amount is computed from the balance — the rule row shows "auto".
  - **Sweep Bank surplus over ₹40,000 to Savings** — an *auto sweep*: keeps ₹40k in Bank and
    moves the rest to Savings each month. This is what grows the savings ring.
- **Transactions** — filter by month/type/category; every row is append-only. One entry is a
  **reversal** (a "Duplicate charge (refunded)" that was reversed) — the "delete/edit" of an
  immutable ledger. Try the **Reverse** action on any normal row.
- **Accounts** — Bank sits at exactly ₹40,000 (the sweep floor), Card is **negative** (real
  credit-card debt), Cash is funded by a monthly ATM-withdrawal transfer, Savings grows via
  the sweep. Transfers never change net worth.

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
/api/summary`, `GET /api/notifications` + `POST /api/notifications/:id/read`, and
`POST/GET/PUT/PATCH/DELETE /api/recurring` + `POST /api/recurring/run`. Every mutation is
Zod-validated, and errors map to typed HTTP statuses (400/401/404/409) via
[`lib/errors.ts`](src/lib/errors.ts) — unexpected failures return a generic 500 without
leaking internals.

---

## The unique twist (the part an AI scaffold won't hand you)

The brief asks for a creative feature an AI wouldn't suggest out of the box. There are two,
and they build on each other. Both are only possible *because* balances are derived from an
immutable ledger — so any account's balance can be recomputed for any point in time.

### 1. Idempotent recurring transactions

Netflix-style rules ("₹649 on the 5th, every month") with **no cron and no scheduler**. On
app load, a materializer generates any entries that are due but missing. The trick that makes
it safe: every generated entry gets a deterministic key like `rule:{id}:2026-07` with a
unique constraint, so running it twice — or after being offline for months — can never
double-charge you. Miss three months? Next time you open the app, the three missing entries
appear at once, each dated to the correct month.

### 2. Smart auto-transfers — dynamic amounts (the standout)

Normal recurring rules repeat a **fixed** number you typed once. These compute the amount
from your **live balance** at the moment they fire:

- **Pay off a card in full** — on payday, move *exactly what the card owes* from Bank to Card,
  whatever that happens to be this month. If the card owes ₹17,812, it transfers ₹17,812 and
  the card lands at ₹0. Spent more next month? It adjusts automatically.
- **Sweep surplus to savings** — "keep ₹40,000 in Bank, move the rest to Savings each month."
  If Bank holds ₹60,000 after salary, it sweeps ₹20,000; if it holds ₹45,000, it sweeps ₹5,000.

An AI scaffold gives you fixed-amount repeats; "clear whatever I currently owe" needs the
balance read *at fire time* and rules run in the right order (salary posts before the sweep
reads the balance). Verified end-to-end: the payoff generated the exact debt, the sweep the
exact surplus, net worth stayed invariant, and re-runs changed nothing.

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
- **Recurring that redid all its work on every page load (caught in review).** The AI's
  materializer was *correct* but quietly wasteful: on every run it walked **every month from a
  rule's start date up to today** and tried to insert each one — the months that already
  existed just bounced off the unique constraint. So a rule that had been running for 3 years
  attempted ~36 pointless database inserts *every single time you opened the app* — cost that
  grows with the rule's age, not with how much is actually new. A human reading the loop spotted
  it. Fixed by giving each rule a `lastMaterializedMonth` cursor: a run now resumes from the
  first unsettled month and only re-scans the current month (whose dynamic amount can still
  change), turning O(rule age) into O(new months). The unique constraint stays as the
  correctness backstop; the cursor is purely the speed-up. See the
  `recurring_materializer_cursor` migration and [`lib/recurring.ts`](src/lib/recurring.ts).

---

## What I'd do next (production notes)

- **Real auth** (NextAuth / Auth.js) + per-user data isolation instead of a single-user cookie.
- **A test suite** for the money/ledger logic (unit tests on derivations + reversal invariants).
- **SQL-based aggregation** for balances/spend once ledgers grow (today they're reduced in JS).
- **Multi-currency** (store currency + minor-unit scale per amount).
- **DB-level guards** for append-only (a trigger/`REVOKE UPDATE,DELETE` on `Entry`) to enforce
  immutability even outside the app.
- Custom categories/accounts, CSV import, and per-account opening balances.
