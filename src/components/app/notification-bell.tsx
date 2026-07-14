"use client";

import * as React from "react";
import { Bell, AlertTriangle, CircleAlert, Mail, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  apiPost,
  revalidate,
  useApi,
  type NotificationDTO,
  type NotificationsDTO,
} from "@/lib/client";
import { cn } from "@/lib/utils";

function iconFor(kind: NotificationDTO["kind"]) {
  if (kind === "BUDGET_100") return <CircleAlert className="size-4 text-destructive" />;
  if (kind === "BUDGET_80") return <AlertTriangle className="size-4 text-warning" />;
  return <Mail className="size-4 text-primary" />;
}

export function NotificationBell() {
  const { data, refetch } = useApi<NotificationsDTO>("/api/notifications");
  const unread = data?.unreadCount ?? 0;
  const items = data?.notifications ?? [];

  async function markAll() {
    await apiPost("/api/notifications/read-all");
    refetch();
    revalidate();
  }

  async function markOne(id: string) {
    await apiPost(`/api/notifications/${id}/read`);
    refetch();
    revalidate();
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 h-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button
              onClick={markAll}
              className="-mr-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50 cursor-pointer"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "group flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-accent",
                  !n.read && "bg-accent/40",
                )}
              >
                <div className="mt-0.5">{iconFor(n.kind)}</div>
                <div className="flex-1 min-w-0">
                  <p className="leading-snug">{n.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {!n.read && (
                  <button
                    onClick={() => markOne(n.id)}
                    title="Mark read"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Check className="size-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
