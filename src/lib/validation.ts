import { z } from "zod";
import { parseRupeesToMinor } from "@/lib/money";
import { isMonthKey } from "@/lib/date";

/**
 * Zod schemas for every mutation. Money arrives from the client as a rupee
 * STRING and is parsed into bigint paise here (never parseFloat). We transform
 * to bigint at the validation edge so handlers only ever see integer minor units.
 */

const rupeeStringToMinor = z
  .string()
  .min(1, "Amount is required")
  .transform((val, ctx) => {
    try {
      const minor = parseRupeesToMinor(val);
      if (minor <= 0n) {
        ctx.addIssue({ code: "custom", message: "Amount must be positive" });
        return z.NEVER;
      }
      return minor;
    } catch (e) {
      ctx.addIssue({
        code: "custom",
        message: e instanceof Error ? e.message : "Invalid amount",
      });
      return z.NEVER;
    }
  });

// Accept a positive rupee amount that may be zero (limits/targets can be 0).
const rupeeStringToMinorNonNeg = z
  .string()
  .transform((val, ctx) => {
    const trimmed = val.trim();
    if (trimmed === "") return 0n;
    try {
      return parseRupeesToMinor(trimmed);
    } catch (e) {
      ctx.addIssue({
        code: "custom",
        message: e instanceof Error ? e.message : "Invalid amount",
      });
      return z.NEVER;
    }
  });

export const monthKeySchema = z
  .string()
  .refine(isMonthKey, "Month must be in YYYY-MM format");

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
});

export const entryTypeSchema = z.enum(["INCOME", "EXPENSE", "TRANSFER"]);

/**
 * Create-entry payload. Cross-field account rules (INCOME needs toAccount,
 * EXPENSE needs fromAccount, TRANSFER needs both distinct) are enforced with a
 * superRefine so the shape matches the ledger invariants.
 */
export const createEntrySchema = z
  .object({
    type: entryTypeSchema,
    amount: rupeeStringToMinor,
    fromAccountId: z.string().cuid().optional().nullable(),
    toAccountId: z.string().cuid().optional().nullable(),
    categoryId: z.string().cuid().optional().nullable(),
    note: z.string().trim().max(200).optional().nullable(),
    occurredAt: z.coerce.date(),
    // optional "make this recurring" companion
    recurring: z
      .object({
        dayOfMonth: z.number().int().min(1).max(31),
        endDate: z.coerce.date().optional().nullable(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "INCOME") {
      if (!data.toAccountId)
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Income needs a destination account" });
      if (data.fromAccountId)
        ctx.addIssue({ code: "custom", path: ["fromAccountId"], message: "Income has no source account" });
      if (!data.categoryId)
        ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Income needs a category" });
    } else if (data.type === "EXPENSE") {
      if (!data.fromAccountId)
        ctx.addIssue({ code: "custom", path: ["fromAccountId"], message: "Expense needs a source account" });
      if (data.toAccountId)
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Expense has no destination account" });
      if (!data.categoryId)
        ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Expense needs a category" });
    } else if (data.type === "TRANSFER") {
      if (!data.fromAccountId || !data.toAccountId)
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Transfer needs both accounts" });
      if (data.fromAccountId && data.toAccountId && data.fromAccountId === data.toAccountId)
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Transfer accounts must differ" });
      // categoryId is ignored for transfers
    }
  });

export type CreateEntryInput = z.infer<typeof createEntrySchema>;

export const categoryBudgetSchema = z.object({
  categoryId: z.string().cuid(),
  limit: rupeeStringToMinorNonNeg,
});

export const preferencesSchema = z.object({
  month: monthKeySchema,
  overallLimit: rupeeStringToMinorNonNeg,
  savingsTarget: rupeeStringToMinorNonNeg,
  categoryBudgets: z.array(categoryBudgetSchema).default([]),
});

export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const onboardingSchema = z.object({
  month: monthKeySchema,
  monthlySalary: rupeeStringToMinorNonNeg, // seeds a real INCOME entry if > 0
  salaryAccountId: z.string().cuid().optional().nullable(),
  overallLimit: rupeeStringToMinorNonNeg,
  savingsTarget: rupeeStringToMinorNonNeg,
  categoryBudgets: z.array(categoryBudgetSchema).default([]),
});

export const recurringRuleSchema = z
  .object({
    type: entryTypeSchema,
    amount: rupeeStringToMinor,
    categoryId: z.string().cuid().optional().nullable(),
    fromAccountId: z.string().cuid().optional().nullable(),
    toAccountId: z.string().cuid().optional().nullable(),
    note: z.string().trim().max(200).optional().nullable(),
    dayOfMonth: z.number().int().min(1).max(31),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional().nullable(),
    active: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.type === "INCOME" && !data.toAccountId)
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Income needs a destination account" });
    if (data.type === "EXPENSE" && !data.fromAccountId)
      ctx.addIssue({ code: "custom", path: ["fromAccountId"], message: "Expense needs a source account" });
    if (data.type === "TRANSFER" && (!data.fromAccountId || !data.toAccountId))
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Transfer needs both accounts" });
  });

export type RecurringRuleInput = z.infer<typeof recurringRuleSchema>;
