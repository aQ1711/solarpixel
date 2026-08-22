import { Users, ClipboardCheck, DollarSign, TrendingUp, UserCog, type LucideIcon } from "lucide-react";

/**
 * Single source of truth for "who can see which /admin/* page," shared
 * by AdminSidebar (renders the links) and app/admin/layout.tsx's route
 * guard (redirects away from a page the current viewer can't see) — one
 * list, so the two can never quietly disagree with each other the way
 * they would if each hardcoded its own copy of these rules.
 *
 * Mirrors the REAL access rules each page's own API routes already
 * enforce server-side (assertAdminModuleAccess / assertSuperAdminAccess
 * in lib/auth/internal-guard.ts) — this file doesn't invent new rules,
 * it just gives the client UI a way to know them ahead of a request
 * failing. That server-side check remains the actual security boundary;
 * see this file's `allowed()` doc comment below and AdminAuthContext's
 * top comment for why this is a client-side convenience, not a
 * server-enforced guard (there's no real session/middleware auth in
 * this codebase yet — see lib/auth/internal-guard.ts's own warning).
 */

export type AdminModule = "LEADS" | "CHECKER";

export interface AdminViewer {
  kind: "SUPER_ADMIN" | "ADMIN";
  userId: string | null;
  name: string;
  modules: AdminModule[];
}

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Whether `viewer` should see/reach this page. Kept as a predicate
   *  (not a static module string) since Pricing/Market Prices/Team are
   *  Super-Admin-only and aren't AdminModule values at all — a plain
   *  "requires: AdminModule" field couldn't express that. */
  allowed: (viewer: AdminViewer) => boolean;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    href: "/admin/leads",
    label: "Leads",
    icon: Users,
    allowed: (v) => v.kind === "SUPER_ADMIN" || v.modules.includes("LEADS"),
  },
  {
    href: "/admin/checker",
    label: "Checker",
    icon: ClipboardCheck,
    allowed: (v) => v.kind === "SUPER_ADMIN" || v.modules.includes("CHECKER"),
  },
  {
    href: "/admin/pricing",
    label: "Pricing",
    icon: DollarSign,
    allowed: (v) => v.kind === "SUPER_ADMIN",
  },
  {
    href: "/admin/market-prices",
    label: "Market Prices",
    icon: TrendingUp,
    allowed: (v) => v.kind === "SUPER_ADMIN",
  },
  {
    href: "/admin/team",
    label: "Team",
    icon: UserCog,
    allowed: (v) => v.kind === "SUPER_ADMIN",
  },
];

/** First nav item `viewer` is actually allowed to see, in the priority
 *  order above — used for the bare `/admin` landing redirect and as the
 *  route guard's fallback when the current path isn't allowed. `null`
 *  only for a misconfigured Admin with zero module grants (a real, if
 *  rare, edge case — Super Admin always matches "Leads" first). */
export function firstAllowedNavItem(viewer: AdminViewer): AdminNavItem | null {
  return ADMIN_NAV_ITEMS.find((item) => item.allowed(viewer)) ?? null;
}
