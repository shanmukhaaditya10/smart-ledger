import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { parseRupeesToMinor } from "../src/lib/money";
import { monthKeyOf, addMonths, monthRange, type MonthKey } from "../src/lib/date";

/**
 * Reproducible, preference-driven demo seed (spec §9).
 *
 * Edit CONFIG to re-seed a different profile — salary, budgets, savings target
 * all flow from here. Amounts vary but come from a FIXED random seed so every
 * run produces identical data. Generated Netflix entries use the SAME dedupeKey
 * scheme as the live materializer, so running `POST /api/recurring/run` after
 * seeding is a no-op (demonstrates idempotency).
 */

// ---------------------------------------------------------------------------
// CONFIG — change these to seed a different reviewer profile.
// ---------------------------------------------------------------------------
const CONFIG = {
  name: "Test",
  email: "test@gmail.com",
  monthlySalary: "120000",
  overallBudget: "60000",
  savingsTarget: "300000",
  categoryBudgets: {
    Rent: "25000",
    Food: "12000",
    Transport: "5000",
    Utilities: "4000",
    Entertainment: "6000",
    Misc: "8000",
  } as Record<string, string>,
  netflix: "649",
  sweepKeepInBank: "40000", // dynamic rule: keep this in Bank, sweep the rest to Savings
  randomSeed: 20260715,
  monthsToSeed: 3, // last 3 months incl. current
};

const DEFAULT_ACCOUNTS = [
  { name: "Cash", type: "CASH" as const },
  { name: "Bank", type: "BANK" as const },
  { name: "Card", type: "CARD" as const },
  { name: "Savings", type: "SAVINGS" as const },
];

const DEFAULT_CATEGORIES = [
  { name: "Salary", kind: "INCOME" as const },
  { name: "Rent", kind: "EXPENSE" as const },
  { name: "Food", kind: "EXPENSE" as const },
  { name: "Transport", kind: "EXPENSE" as const },
  { name: "Utilities", kind: "EXPENSE" as const },
  { name: "Entertainment", kind: "EXPENSE" as const },
  { name: "Savings", kind: "EXPENSE" as const },
  { name: "Misc", kind: "EXPENSE" as const },
];

// Deterministic PRNG (mulberry32) so seeded amounts are reproducible.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(CONFIG.randomSeed);

/** Random integer paise around a rupee base, +/- jitterPct. */
function jitterMinor(baseRupees: number, jitterPct: number): bigint {
  const delta = (rand() * 2 - 1) * jitterPct;
  const rupees = Math.max(1, Math.round(baseRupees * (1 + delta)));
  return BigInt(rupees) * 100n;
}

function dayInMonth(month: MonthKey, day: number): Date {
  const { start } = monthRange(month);
  const d = new Date(start);
  d.setUTCDate(day);
  return d;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  console.log("Seeding demo data…");

  // Fresh start for the demo user (seed is a dev tool; resetting is allowed).
  await prisma.user.deleteMany({ where: { email: CONFIG.email } });

  const user = await prisma.user.create({
    data: { name: CONFIG.name, email: CONFIG.email },
  });

  await prisma.account.createMany({
    data: DEFAULT_ACCOUNTS.map((a) => ({ ...a, userId: user.id })),
  });
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id })),
  });

  const accounts = await prisma.account.findMany({ where: { userId: user.id } });
  const categories = await prisma.category.findMany({ where: { userId: user.id } });
  const acc = (name: string) => accounts.find((a) => a.name === name)!;
  const cat = (name: string) => categories.find((c) => c.name === name)!;

  const now = new Date();
  const thisMonth = monthKeyOf(now);
  const months: MonthKey[] = [];
  for (let i = CONFIG.monthsToSeed - 1; i >= 0; i--) months.push(addMonths(thisMonth, -i));

  // One Netflix recurring rule, starting at the first seeded month.
  const netflixMinor = parseRupeesToMinor(CONFIG.netflix);
  const netflixRule = await prisma.recurringRule.create({
    data: {
      userId: user.id,
      type: "EXPENSE",
      amountMinor: netflixMinor,
      categoryId: cat("Entertainment").id,
      fromAccountId: acc("Card").id,
      note: "Netflix subscription",
      cadence: "MONTHLY",
      dayOfMonth: 5,
      startDate: dayInMonth(months[0], 5),
      active: true,
    },
  });

  // Two smart (dynamic-amount) rules, ACTIVE so they show up as real, working
  // examples. The materializer (run on app load, or via `POST /api/recurring/run`
  // in the seed's follow-up) fills in their transfers from live balances.
  //   PAYOFF — on payday (day 1), clear whatever the Card owes from prior months
  //            (this month's card spend accrues until next payday, so the Card
  //            still shows a live balance).
  //   SWEEP  — on day 2, move everything above `sweepKeepInBank` to Savings.
  await prisma.recurringRule.create({
    data: {
      userId: user.id,
      type: "TRANSFER",
      amountMode: "PAYOFF",
      amountMinor: 0n,
      fromAccountId: acc("Bank").id,
      toAccountId: acc("Card").id,
      note: "Clear credit card on payday",
      cadence: "MONTHLY",
      dayOfMonth: 1,
      startDate: dayInMonth(months[0], 1),
      active: true,
    },
  });
  await prisma.recurringRule.create({
    data: {
      userId: user.id,
      type: "TRANSFER",
      amountMode: "SWEEP_SURPLUS",
      amountMinor: 0n,
      thresholdMinor: parseRupeesToMinor(CONFIG.sweepKeepInBank),
      fromAccountId: acc("Bank").id,
      toAccountId: acc("Savings").id,
      note: `Sweep Bank surplus over ₹${CONFIG.sweepKeepInBank} to Savings`,
      cadence: "MONTHLY",
      dayOfMonth: 2,
      startDate: dayInMonth(months[0], 2),
      active: true,
    },
  });

  let entryCount = 0;

  for (const month of months) {
    // Salary — same dedupeKey scheme as onboarding.
    await prisma.entry.create({
      data: {
        userId: user.id,
        type: "INCOME",
        amountMinor: parseRupeesToMinor(CONFIG.monthlySalary),
        toAccountId: acc("Bank").id,
        categoryId: cat("Salary").id,
        note: "Monthly salary",
        occurredAt: dayInMonth(month, 1),
        dedupeKey: `salary:${user.id}:${month}`,
      },
    });
    entryCount++;

    // Rent — fixed.
    await prisma.entry.create({
      data: {
        userId: user.id,
        type: "EXPENSE",
        amountMinor: parseRupeesToMinor("25000"),
        fromAccountId: acc("Bank").id,
        categoryId: cat("Rent").id,
        note: "Flat rent",
        occurredAt: dayInMonth(month, 2),
      },
    });
    entryCount++;

    // Groceries / food across several days (varied).
    for (const day of [3, 8, 14, 19, 24, 28]) {
      await prisma.entry.create({
        data: {
          userId: user.id,
          type: "EXPENSE",
          amountMinor: jitterMinor(1800, 0.5),
          fromAccountId: acc(rand() > 0.5 ? "Card" : "Cash").id,
          categoryId: cat("Food").id,
          note: "Groceries & eating out",
          occurredAt: dayInMonth(month, day),
        },
      });
      entryCount++;
    }

    // Transport, Utilities, Entertainment, Misc — a few each.
    const misc: [string, number, number][] = [
      ["Transport", 900, 6],
      ["Transport", 700, 17],
      ["Utilities", 3200, 10],
      ["Entertainment", 1200, 12],
      ["Misc", 2500, 21],
    ];
    for (const [catName, base, day] of misc) {
      await prisma.entry.create({
        data: {
          userId: user.id,
          type: "EXPENSE",
          amountMinor: jitterMinor(base, 0.3),
          fromAccountId: acc("Card").id,
          categoryId: cat(catName).id,
          note: `${catName} spend`,
          occurredAt: dayInMonth(month, day),
        },
      });
      entryCount++;
    }

    // Fund the Cash wallet from Bank at the start of the month (ATM withdrawal),
    // so cash spends draw down a real balance instead of going negative. Savings
    // is fed by the SWEEP_SURPLUS rule, not a manual transfer, so it showcases
    // that feature rather than duplicating it.
    await prisma.entry.create({
      data: {
        userId: user.id,
        type: "TRANSFER",
        amountMinor: parseRupeesToMinor("12000"),
        fromAccountId: acc("Bank").id,
        toAccountId: acc("Cash").id,
        note: "ATM withdrawal",
        occurredAt: dayInMonth(month, 1),
      },
    });
    entryCount++;

    // Netflix — already materialized, using the live materializer's dedupeKey
    // so `recurring/run` won't re-create it.
    await prisma.entry.create({
      data: {
        userId: user.id,
        type: "EXPENSE",
        amountMinor: netflixMinor,
        fromAccountId: acc("Card").id,
        categoryId: cat("Entertainment").id,
        note: "Netflix subscription",
        occurredAt: dayInMonth(month, 5),
        recurringRuleId: netflixRule.id,
        dedupeKey: `rule:${netflixRule.id}:${month}`,
      },
    });
    entryCount++;

    // Budget + per-category budgets + savings target for the month.
    const budget = await prisma.budget.create({
      data: {
        userId: user.id,
        month,
        overallLimitMinor: parseRupeesToMinor(CONFIG.overallBudget),
        savingsTargetMinor: parseRupeesToMinor(CONFIG.savingsTarget),
      },
    });
    await prisma.categoryBudget.createMany({
      data: Object.entries(CONFIG.categoryBudgets).map(([name, rupees]) => ({
        budgetId: budget.id,
        categoryId: cat(name).id,
        limitMinor: parseRupeesToMinor(rupees),
      })),
    });
  }

  // Reversal example (the "delete/edit" of an immutable ledger): an original
  // expense plus a reversing entry that nets it back out. Showcases the reverse
  // action + the "Reversed"/"Reversal" badges in the transactions list.
  const original = await prisma.entry.create({
    data: {
      userId: user.id,
      type: "EXPENSE",
      amountMinor: parseRupeesToMinor("1499"),
      fromAccountId: acc("Card").id,
      categoryId: cat("Misc").id,
      note: "Duplicate charge (refunded)",
      occurredAt: dayInMonth(thisMonth, 9),
    },
  });
  await prisma.entry.create({
    data: {
      userId: user.id,
      type: "EXPENSE",
      amountMinor: original.amountMinor,
      fromAccountId: original.fromAccountId,
      categoryId: original.categoryId,
      note: "Reversal of: Duplicate charge (refunded)",
      occurredAt: original.occurredAt,
      reversesEntryId: original.id,
    },
  });
  entryCount += 2;

  // A couple of budget alerts so the notification bell is non-empty on first load.
  await prisma.notification.create({
    data: {
      userId: user.id,
      kind: "BUDGET_80",
      message: "You've used 80% of your Entertainment budget this month.",
      dedupeKey: `budget80:${thisMonth}:cat:${cat("Entertainment").id}`,
    },
  });
  await prisma.notification.create({
    data: {
      userId: user.id,
      kind: "BUDGET_100",
      message: "You're over your Food budget this month.",
      dedupeKey: `budget100:${thisMonth}:cat:${cat("Food").id}`,
    },
  });

  console.log(`Seeded user ${user.email} with ${entryCount} entries across ${months.join(", ")}.`);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
