"use client";

import { createContext, useContext } from "react";
import type { AdminViewer } from "@/components/admin/adminNav";

/**
 * Bridges app/admin/layout.tsx's single, shell-level AccessGate down to
 * each /admin/* page — before this, every page had its OWN AccessGate
 * instance and got `onUnauthorized` as a render-prop argument straight
 * from it. Centralizing the gate in the layout (one lock screen for the
 * whole admin shell, not one per page) means that render-prop path no
 * longer reaches individual pages, so they read the same values from
 * this context instead. `viewer` is null until /api/admin/whoami
 * resolves (or if it fails) — every consumer must handle that, same as
 * they already handled a pre-fetch loading state.
 *
 * This is still the SAME interim, non-session auth as always — see
 * lib/auth/internal-guard.ts's top doc comment. `onUnauthorized` clears
 * the stored token and re-locks the shell, exactly like each page's own
 * AccessGate used to.
 */
export interface AdminAuthValue {
  viewer: AdminViewer | null;
  onUnauthorized: (reason?: string) => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export const AdminAuthProvider = AdminAuthContext.Provider;

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth() must be called from a component rendered under app/admin/layout.tsx.");
  return ctx;
}
