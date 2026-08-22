"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";
import { firstAllowedNavItem } from "@/components/admin/adminNav";

/**
 * Bare /admin — redirects to the first page this viewer is actually
 * allowed to see (Leads first in priority order for everyone, including
 * Super Admin — see ADMIN_NAV_ITEMS in components/admin/adminNav.ts —
 * since Leads is this app's highest-traffic day-to-day tool, not the
 * config-heavy Pricing page). Renders under app/admin/layout.tsx like
 * every other /admin/* route, so `viewer` is already resolving/resolved
 * by the time this mounts.
 */
export default function AdminIndexPage() {
  const { viewer } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (!viewer) return;
    const target = firstAllowedNavItem(viewer);
    router.replace(target?.href ?? "/admin/leads");
  }, [viewer, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-stone-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
    </div>
  );
}
