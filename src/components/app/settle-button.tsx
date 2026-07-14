"use client";

import * as React from "react";
import { Loader2, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiPost, revalidate, type AccountBalanceDTO } from "@/lib/client";
import { inr } from "@/lib/format";

/**
 * "Pay off in full" action for an account that's in debt (negative balance).
 * The amount is computed on the server from the live balance — the user never
 * types it — so it always clears to exactly ₹0.
 */
export function SettleButton({
  account,
  accounts,
}: {
  account: AccountBalanceDTO;
  accounts: AccountBalanceDTO[];
}) {
  const debtMinor = (-BigInt(account.balanceMinor)).toString();
  const sources = accounts.filter((a) => a.id !== account.id);
  const defaultSource =
    sources.find((a) => a.name === "Bank") ?? sources[0];

  const [open, setOpen] = React.useState(false);
  const [fromId, setFromId] = React.useState(defaultSource?.id ?? "");
  const [submitting, setSubmitting] = React.useState(false);

  async function settle() {
    if (!fromId) return;
    setSubmitting(true);
    try {
      await apiPost(`/api/accounts/${account.id}/payoff`, { fromAccountId: fromId });
      toast.success(`Paid off ${account.name}`);
      revalidate();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't pay it off");
    } finally {
      setSubmitting(false);
    }
  }

  const fromName = accounts.find((a) => a.id === fromId)?.name ?? "—";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <HandCoins className="size-3.5" /> Settle
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pay off {account.name}?</DialogTitle>
          <DialogDescription>
            This appends a transfer of{" "}
            <span className="font-medium text-foreground">{inr(debtMinor)}</span>, bringing{" "}
            {account.name}&apos;s balance to ₹0. It&apos;s a transfer, so your net worth
            doesn&apos;t change — you&apos;re just settling the debt with your own money.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Pay from</span>
          <Select value={fromId} onValueChange={setFromId}>
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {sources.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} ({inr(a.balanceMinor)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {fromName} −{inr(debtMinor)} → {account.name} +{inr(debtMinor)}
          </p>
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={settle} disabled={submitting || !fromId}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Pay {inr(debtMinor)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
