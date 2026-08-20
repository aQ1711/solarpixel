"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { getStoredToken, setStoredToken, clearStoredToken } from "@/lib/internal/access";
import type { InternalRole } from "@/lib/auth/internal-guard";

/**
 * Interim access gate for the two internal dashboards — see the warning
 * in lib/auth/internal-guard.ts. This is a shared-secret prompt, not a
 * login: there's no way to verify the code client-side, so it "unlocks"
 * optimistically and relies on the first API call either succeeding or
 * calling `onUnauthorized` (passed to children) to bounce back here.
 */
export function AccessGate({
  role,
  title,
  children,
}: {
  role: InternalRole;
  title: string;
  children: (opts: { onUnauthorized: () => void }) => ReactNode;
}) {
  // Deliberately starts false on every render, server AND client, so the
  // initial client render always matches the server-rendered markup —
  // sessionStorage doesn't exist on the server, so reading it inside the
  // useState initializer (the old bug here) makes the client's first
  // render disagree with SSR whenever a token was already stored,
  // triggering a hydration mismatch. Reading it in an effect instead
  // means it only ever runs post-hydration, client-only, at the cost of
  // a brief flash of the locked form for already-unlocked users.
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reading an external system (sessionStorage) client-only, by
    // design; see the comment above `unlocked`'s declaration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (getStoredToken(role)) setUnlocked(true);
  }, [role]);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setStoredToken(role, code.trim());
    setUnlocked(true);
    setError(null);
  }

  function handleUnauthorized() {
    clearStoredToken(role);
    setUnlocked(false);
    setCode("");
    setError("Invalid access code — try again.");
  }

  if (!unlocked) {
    return (
      <main
        style={{ colorScheme: "dark" }}
        className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] px-5"
      >
        <form
          onSubmit={handleUnlock}
          className="w-full max-w-sm rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-2xl shadow-black/40"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-amber)]/10">
            <Lock className="h-6 w-6 text-[var(--color-amber)]" />
          </div>
          <h1 className="mt-3 text-lg font-semibold text-[var(--color-ink)]">{title}</h1>
          <p className="mt-1 text-xs text-[var(--color-ink-faint)]">Internal use only. Enter your access code.</p>

          <input
            type="password"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code"
            className="mt-4 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-center text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-amber)] focus:ring-2 focus:ring-[var(--color-amber)]/25"
          />

          {error && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="mt-4 w-full rounded-xl bg-[var(--color-amber)] py-3 text-sm font-semibold text-[var(--color-amber-ink)] transition hover:bg-[var(--color-amber-strong)]"
          >
            Unlock
          </button>
        </form>
      </main>
    );
  }

  return <>{children({ onUnauthorized: handleUnauthorized })}</>;
}
