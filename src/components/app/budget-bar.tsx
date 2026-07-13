import { Progress } from "@/components/ui/progress";
import { inr, type Minor } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Color the bar by usage: calm under 80%, amber 80–100%, rose over. */
export function usageColor(pct: number) {
  if (pct >= 100) return { bar: "bg-destructive", text: "text-destructive" };
  if (pct >= 80) return { bar: "bg-warning", text: "text-warning" };
  return { bar: "bg-success", text: "text-success" };
}

export function BudgetBar({
  label,
  spent,
  limit,
  pct,
}: {
  label: string;
  spent: Minor;
  limit: Minor | null;
  pct: number | null;
}) {
  const hasLimit = limit !== null && pct !== null;
  const clamped = Math.min(100, pct ?? 0);
  const color = usageColor(pct ?? 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted-foreground">
          <span className={cn("font-medium text-foreground", hasLimit && color.text)}>{inr(spent)}</span>
          {hasLimit ? <> / {inr(limit!)}</> : <span className="ml-1 text-xs">no budget</span>}
        </span>
      </div>
      {hasLimit && (
        <div className="mt-1.5 flex items-center gap-2">
          <Progress value={clamped} indicatorClassName={color.bar} className="h-2" />
          <span className={cn("w-11 shrink-0 text-right text-xs font-medium tabular", color.text)}>
            {Math.round(pct!)}%
          </span>
        </div>
      )}
    </div>
  );
}
