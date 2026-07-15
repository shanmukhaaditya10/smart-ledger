"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Wallet,
  ShieldCheck,
  ArrowRight,
  Layers,
  Sparkles,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost, type UserDTO } from "@/lib/client";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/app/theme-toggle";

// Mapped to how the Bytex Fresher Challenge says to stand out.
const FEATURES = [
  { icon: Sparkles, title: "The unique twist", desc: "Smart auto-transfers: pay off a card or sweep surplus to savings, sized from live balances." },
  { icon: ShieldCheck, title: "Production polish", desc: "Integer-money, immutable double-entry, typed error handling — clean, structured code." },
  { icon: Layers, title: "Edge cases handled", desc: "Balances derived from history; recurring is idempotent and never double-charges." },
  { icon: Bot, title: "AI as co-pilot", desc: "Built fast with AI — the money bugs it introduced were caught and fixed by hand." },
];

export function Welcome() {
  const router = useRouter();
  // Pre-filled with the seeded demo account so it's one click to sign in.
  const [name, setName] = React.useState("Test");
  const [email, setEmail] = React.useState("test@gmail.com");
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error("Enter your name and email");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost<{ user: UserDTO; created: boolean }>("/api/user", { name, email });
      toast.success(`Welcome, ${res.user.name.split(" ")[0]}!`);
      router.push(res.created ? "/onboarding" : "/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-2">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      {/* Left: pitch */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary/[0.04] p-10 lg:flex xl:p-14">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(40rem 40rem at 10% 0%, var(--primary), transparent 45%)",
            opacity: 0.08,
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
            <Wallet className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Smart Ledger</span>
        </div>

        <div className="relative max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
          >
            <Sparkles className="size-3.5" /> Bytex Fresher Challenge · Take-home
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl"
          >
            The Smart Mini-Ledger.
            <span className="block text-primary">Built beyond the AI scaffold.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-muted-foreground"
          >
            My submission for the Junior Full-Stack Engineer role — a full-stack financial
            ledger that&apos;s immutable, integer-money and double-entry, with a creative twist
            an AI wouldn&apos;t hand you out of the box.
          </motion.p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.06 }}
                className="rounded-xl border border-border bg-card/60 p-4"
              >
                <f.icon className="size-5 text-primary" />
                <div className="mt-2 text-sm font-medium">{f.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-muted-foreground">
          Next.js · TypeScript · PostgreSQL · Prisma · Docker — see the README for the AI write-up
        </div>
      </div>

      {/* Right: form */}
      <div className="flex min-h-screen items-center justify-center p-6 lg:min-h-0">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
              <Wallet className="size-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Smart Ledger</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">Let&apos;s set up your ledger</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Just a name and email — no password. This is a single-user demo.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Test"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="test@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" size="lg" className="w-full gap-2" disabled={submitting}>
              {submitting ? "Setting up…" : "Continue"}
              {!submitting && <ArrowRight className="size-4" />}
            </Button>
          </form>

          <div className="mt-6 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>
              No real auth here — it&apos;s intentionally left out so the app stays one click
              away to try. Sign-in just picks the single demo user. :)
            </span>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Returning? Enter the same email to pick up where you left off.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
