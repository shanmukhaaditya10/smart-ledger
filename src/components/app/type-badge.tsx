import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type EntryType = "INCOME" | "EXPENSE" | "TRANSFER";

const MAP = {
  INCOME: { label: "Income", variant: "success" as const, Icon: ArrowDownLeft },
  EXPENSE: { label: "Expense", variant: "destructive" as const, Icon: ArrowUpRight },
  TRANSFER: { label: "Transfer", variant: "secondary" as const, Icon: ArrowLeftRight },
};

export function TypeBadge({ type }: { type: EntryType }) {
  const { label, variant, Icon } = MAP[type];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}

/** Just the colored icon disc, for list rows. */
export function TypeIcon({ type }: { type: EntryType }) {
  const { Icon } = MAP[type];
  const tone =
    type === "INCOME"
      ? "bg-success/12 text-success"
      : type === "EXPENSE"
        ? "bg-destructive/12 text-destructive"
        : "bg-primary/10 text-primary";
  return (
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${tone}`}>
      <Icon className="size-4" />
    </span>
  );
}
