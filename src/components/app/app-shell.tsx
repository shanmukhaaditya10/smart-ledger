"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Plus,
  Receipt,
  Repeat,
  User as UserIcon,
  ChevronLeft,
  ChevronRight,
  Wallet,
  LogOut,
} from "lucide-react";
import { MonthProvider, useMonth } from "@/components/app/month-context";
import { NotificationBell } from "@/components/app/notification-bell";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/lib/format";
import { apiPost, revalidate, type UserDTO } from "@/lib/client";
import { toast } from "sonner";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/add", label: "Add entry", icon: Plus },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Wallet className="size-5" />
      </span>
      <div className="leading-tight">
        <div className="font-semibold tracking-tight">Smart Ledger</div>
        <div className="text-[11px] text-muted-foreground">Immutable · derived</div>
      </div>
    </Link>
  );
}

function MonthSwitcher() {
  const { month, prev, next, isCurrent } = useMonth();
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-1 py-0.5 shadow-sm">
      <Button variant="ghost" size="icon-sm" onClick={prev} aria-label="Previous month">
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-30 text-center text-sm font-medium tabular">{monthLabel(month)}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={next}
        disabled={isCurrent}
        aria-label="Next month"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

/** Runs the idempotent recurring materializer once when the app mounts. */
function useRecurringRunOnLoad() {
  React.useEffect(() => {
    let cancelled = false;
    apiPost<{ createdCount: number }>("/api/recurring/run")
      .then((r) => {
        if (cancelled) return;
        if (r.createdCount > 0) {
          toast.success(
            `Added ${r.createdCount} recurring ${r.createdCount === 1 ? "entry" : "entries"}`,
          );
          revalidate();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
}

function LogoutButton({ className }: { className?: string }) {
  const [loading, setLoading] = React.useState(false);

  async function onLogout() {
    setLoading(true);
    try {
      await apiPost("/api/logout");
      // Full reload so the cleared session cookie is picked up and the root
      // route re-renders the welcome/sign-in screen.
      window.location.href = "/";
    } catch {
      toast.error("Couldn't log out");
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onLogout}
      disabled={loading}
      aria-label="Log out"
      title="Log out"
      className={className}
    >
      <LogOut className="size-4" />
    </Button>
  );
}

function Shell({ user, children }: { user: UserDTO; children: React.ReactNode }) {
  const pathname = usePathname();
  useRecurringRunOnLoad();

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card/60 backdrop-blur-xl px-4 py-5 md:flex">
        <Logo />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
          <LogoutButton className="shrink-0" />
        </div>
      </aside>

      {/* Main column */}
      <div className="md:pl-60">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl md:px-8">
          <div className="md:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <MonthSwitcher />
            <Link href="/add" className="hidden sm:block">
              <Button size="sm" className="gap-1.5">
                <Plus className="size-4" /> Add
              </Button>
            </Link>
            <NotificationBell />
            <ThemeToggle />
            <LogoutButton className="md:hidden" />
          </div>
        </header>

        <main className="px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-border bg-card/90 backdrop-blur-xl py-1.5 md:hidden">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function AppShell({ user, children }: { user: UserDTO; children: React.ReactNode }) {
  return (
    <MonthProvider>
      <Shell user={user}>{children}</Shell>
    </MonthProvider>
  );
}
