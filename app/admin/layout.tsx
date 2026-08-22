"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AccessGate } from "@/components/internal/AccessGate";
import { internalFetch } from "@/lib/internal/access";
import { AdminAuthProvider } from "@/components/admin/AdminAuthContext";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ADMIN_NAV_ITEMS, firstAllowedNavItem, type AdminViewer } from "@/components/admin/adminNav";

/**
 * Unified admin shell (2026-08-22) — ONE AccessGate + ONE sidebar for
 * every /admin/* page, replacing the old model where each page (pricing,
 * leads, checker, team, market-prices) mounted its own AccessGate and
 * showed its own separate lock screen. A Next.js layout persists across
 * navigation between its child routes by design — the sidebar/shell
 * below never remounts when moving between e.g. /admin/leads and
 * /admin/checker, satisfying "layout persistence" for free as long as
 * every internal link uses next/link (it does — see AdminSidebar and
 * each page's own cross-links).
 *
 * Client-side only, deliberately — see the "Auth depth" decision this
 * was built against: there's no real session/login system in this
 * codebase (lib/auth/internal-guard.ts's shared-secret/access-code
 * tokens, checked per-request server-side, stored in sessionStorage
 * client-side), so a server-side middleware.ts role redirect isn't
 * actually buildable without first replacing that whole model — out of
 * scope here. What this DOES give: a sidebar that only renders links a
 * viewer can reach, and a route guard that redirects away from a page
 * they can't BEFORE that page's own API calls 401 and force a full
 * re-login. The real security boundary remains exactly what it always
 * was — every /admin/api/* route's own assertSuperAdminAccess /
 * assertAdminModuleAccess check — this shell only improves the UX
 * around it, never replaces it.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AccessGate role="ADMIN" title="Solar Pixel · Admin">
      {({ onUnauthorized }) => <AdminShell onUnauthorized={onUnauthorized}>{children}</AdminShell>}
    </AccessGate>
  );
}

function AdminShell({ onUnauthorized, children }: { onUnauthorized: (reason?: string) => void; children: React.ReactNode }) {
  const [viewer, setViewer] = useState<AdminViewer | null>(null);
  const [resolving, setResolving] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  // true = allowed, false = a known /admin/* page this viewer can't
  // reach, null = still resolving OR an unrecognized path (e.g. bare
  // /admin, which handles its own redirect) — only `false` should ever
  // block rendering `children` below.
  const matchedNavItem = ADMIN_NAV_ITEMS.find((item) => pathname === item.href || pathname?.startsWith(`${item.href}/`));
  const pathAllowed = resolving || !matchedNavItem ? null : viewer ? matchedNavItem.allowed(viewer) : false;

  useEffect(() => {
    let cancelled = false;
    internalFetch("ADMIN", "/api/admin/whoami")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) return onUnauthorized();
        const data = await res.json();
        if (res.ok) setViewer(data.viewer ?? null);
      })
      .catch(() => {})
      .finally(() => !cancelled && setResolving(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route guard — bounce away from a page this viewer isn't allowed to
  // see (e.g. a delegated Admin with only LEADS typing /admin/pricing)
  // toward the first page they DO have. Only acts on paths
  // ADMIN_NAV_ITEMS actually knows about — a future /admin/* page not
  // yet added there is left alone rather than guessed at.
  //
  // `pathAllowed` below is computed in the render body, NOT inside this
  // effect, and gates whether `children` renders at all (see the return
  // statement) — the actual navigation still has to happen from an
  // effect (side effects can't run during render), but a disallowed
  // page must never be given even one render to mount, or its own
  // useEffect fires its own fetch immediately, gets a real 401 back
  // (correctly — that page's API route enforces this independently),
  // and force-logs the whole shell out before this effect's redirect
  // has a chance to run. Caught live: /admin/pricing briefly mounted
  // for a LEADS-only Admin before the redirect landed, and its own
  // "unauthorized" handling won the race, showing "Invalid access code"
  // instead of a clean bounce to /admin/leads.
  useEffect(() => {
    if (pathAllowed !== false || !viewer) return;
    const fallback = firstAllowedNavItem(viewer);
    router.replace(fallback?.href ?? "/admin");
  }, [pathAllowed, viewer, router]);

  function handleLogout() {
    // Same clear-token-and-relock path onUnauthorized already uses, just
    // with honest copy — the user didn't do anything wrong, they chose
    // to log out (see AccessGate's optional `reason` param).
    onUnauthorized("Logged out. Enter your access code again to continue.");
  }

  return (
    <AdminAuthProvider value={{ viewer, onUnauthorized }}>
      <div className="flex min-h-dvh bg-stone-50">
        <AdminSidebar viewer={viewer} onLogout={handleLogout} />
        <div className="min-w-0 flex-1">
          {pathAllowed === false ? (
            // Deliberately NOT `children` for even one render — see the
            // route guard effect's doc comment above for the real 401
            // race this avoids.
            <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-stone-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
            </div>
          ) : resolving ? (
            <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-stone-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </AdminAuthProvider>
  );
}
