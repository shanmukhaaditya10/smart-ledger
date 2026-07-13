import { getSummary } from "@/lib/ledger";
import { formatINR } from "@/lib/money";
import type { MonthKey } from "@/lib/date";

/**
 * Monthly summary report (spec §8): total income/expense, per-category
 * actual-vs-budget, savings target hit/missed, biggest category. Rendered to
 * plain text + HTML for the (env-gated) email and the in-app notification.
 */

export type MonthlyReport = {
  month: MonthKey;
  incomeMinor: bigint;
  expenseMinor: bigint;
  netMinor: bigint;
  savingsHit: boolean;
  savingsCurrentMinor: bigint;
  savingsTargetMinor: bigint;
  biggestCategory: { name: string; spentMinor: bigint } | null;
  categories: {
    name: string;
    spentMinor: bigint;
    limitMinor: bigint | null;
    overBudget: boolean;
  }[];
};

export async function buildMonthlyReport(userId: string, month: MonthKey): Promise<MonthlyReport> {
  const summary = await getSummary(userId, month);
  return {
    month,
    incomeMinor: summary.incomeMinor,
    expenseMinor: summary.expenseMinor,
    netMinor: summary.incomeMinor - summary.expenseMinor,
    savingsHit: summary.savings.currentMinor >= summary.savings.targetMinor && summary.savings.targetMinor > 0n,
    savingsCurrentMinor: summary.savings.currentMinor,
    savingsTargetMinor: summary.savings.targetMinor,
    biggestCategory: summary.biggestCategory,
    categories: summary.categories
      .filter((c) => c.kind === "EXPENSE")
      .map((c) => ({
        name: c.name,
        spentMinor: c.spentMinor,
        limitMinor: c.limitMinor,
        overBudget: c.limitMinor !== null && c.spentMinor > c.limitMinor,
      })),
  };
}

export function reportSubject(report: MonthlyReport): string {
  return `Your ${report.month} money summary — net ${formatINR(report.netMinor)}`;
}

export function reportText(report: MonthlyReport): string {
  const lines: string[] = [];
  lines.push(`Smart Ledger — ${report.month} summary`);
  lines.push("");
  lines.push(`Income:  ${formatINR(report.incomeMinor)}`);
  lines.push(`Expense: ${formatINR(report.expenseMinor)}`);
  lines.push(`Net:     ${formatINR(report.netMinor)}`);
  lines.push("");
  lines.push(
    report.savingsTargetMinor > 0n
      ? `Savings target ${report.savingsHit ? "HIT ✅" : "missed"}: ${formatINR(report.savingsCurrentMinor)} of ${formatINR(report.savingsTargetMinor)}`
      : "No savings target set.",
  );
  if (report.biggestCategory) {
    lines.push(`Biggest category: ${report.biggestCategory.name} (${formatINR(report.biggestCategory.spentMinor)})`);
  }
  lines.push("");
  lines.push("Category actual vs budget:");
  for (const c of report.categories) {
    const limit = c.limitMinor === null ? "no budget" : formatINR(c.limitMinor);
    const flag = c.overBudget ? "  ⚠ over" : "";
    lines.push(`  ${c.name}: ${formatINR(c.spentMinor)} / ${limit}${flag}`);
  }
  return lines.join("\n");
}

export function reportHtml(report: MonthlyReport): string {
  const rows = report.categories
    .map(
      (c) => `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #eee">${c.name}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${formatINR(c.spentMinor)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;color:#888">${c.limitMinor === null ? "—" : formatINR(c.limitMinor)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${c.overBudget ? "⚠️" : "✅"}</td>
      </tr>`,
    )
    .join("");
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;color:#111">
    <h2 style="margin-bottom:4px">Your ${report.month} summary</h2>
    <p style="color:#666;margin-top:0">Smart Ledger</p>
    <div style="display:flex;gap:12px;margin:16px 0">
      <div style="flex:1;background:#f0fdf4;border-radius:12px;padding:12px"><div style="color:#16a34a;font-size:12px">Income</div><div style="font-size:20px;font-weight:600">${formatINR(report.incomeMinor)}</div></div>
      <div style="flex:1;background:#fef2f2;border-radius:12px;padding:12px"><div style="color:#dc2626;font-size:12px">Expense</div><div style="font-size:20px;font-weight:600">${formatINR(report.expenseMinor)}</div></div>
      <div style="flex:1;background:#eff6ff;border-radius:12px;padding:12px"><div style="color:#2563eb;font-size:12px">Net</div><div style="font-size:20px;font-weight:600">${formatINR(report.netMinor)}</div></div>
    </div>
    <p>${report.savingsTargetMinor > 0n ? `Savings target <b>${report.savingsHit ? "hit 🎉" : "missed"}</b> — ${formatINR(report.savingsCurrentMinor)} of ${formatINR(report.savingsTargetMinor)}.` : "No savings target set."}</p>
    ${report.biggestCategory ? `<p>Biggest category: <b>${report.biggestCategory.name}</b> (${formatINR(report.biggestCategory.spentMinor)}).</p>` : ""}
    <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:14px">
      <thead><tr>
        <th style="text-align:left;padding:6px 12px;color:#888;font-weight:500">Category</th>
        <th style="text-align:right;padding:6px 12px;color:#888;font-weight:500">Spent</th>
        <th style="text-align:right;padding:6px 12px;color:#888;font-weight:500">Budget</th>
        <th style="text-align:right;padding:6px 12px;color:#888;font-weight:500"></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
