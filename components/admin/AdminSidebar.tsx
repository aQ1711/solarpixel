"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LogOut, X } from "lucide-react";
import { ADMIN_NAV_ITEMS, type AdminViewer } from "@/components/admin/adminNav";
import { BrandMark } from "@/components/BrandMark";

/**
 * Unified left sidebar for every /admin/* page (app/admin/layout.tsx).
 * Collapsible (icon-only rail vs. full labels, state is local — no
 * persistence across reloads, matching how lightweight everything else
 * about this interim admin shell is), filters ADMIN_NAV_ITEMS down to
 * whatever `viewer` is actually allowed to see, and highlights the
 * active item off `usePathname()`. `viewer === null` (still resolving
 * /api/admin/whoami, or it failed) renders a skeleton with every link
 * hidden rather than guessing — same "never show something we haven't
 * confirmed" convention used throughout this app's pricing surfaces.
 *
 * Phones (2026-10-07, "mobile friendly"): below `lg` this is a slide-in
 * drawer opened from the top bar in app/admin/layout.tsx, not a permanent
 * 224px rail that left a 390px screen almost no room for the page. The
 * icon-rail collapse only exists at `lg`+ (every collapsed-state class is
 * `lg:`-prefixed), so the drawer always shows full labels. Desktop
 * behaviour is unchanged.
 */
export function AdminSidebar({
  viewer,
  onLogout,
  mobileOpen,
  onMobileClose,
}: {
  viewer: AdminViewer | null;
  onLogout: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const items = viewer ? ADMIN_NAV_ITEMS.filter((item) => item.allowed(viewer)) : [];

  // Escape closes the drawer (only listens while it's open).
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      {mobileOpen && (
        <div aria-hidden="true" onClick={onMobileClose} className="fixed inset-0 z-40 bg-stone-900/40 lg:hidden" />
      )}

      <aside
        id="admin-nav"
        className={`print:hidden fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] shrink-0 flex-col border-r border-stone-200 bg-white transition-[transform,visibility] duration-200 ${
          mobileOpen ? "translate-x-0 shadow-2xl" : "invisible -translate-x-full"
        } lg:visible lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:max-w-none lg:translate-x-0 lg:shadow-none lg:transition-[width] ${
          collapsed ? "lg:w-16" : "lg:w-56"
        }`}
      >
        <div
          className={`flex items-center gap-2 border-b border-stone-100 px-4 py-4 ${
            collapsed ? "lg:justify-center lg:px-0" : ""
          }`}
        >
          {/* Real Solar Pixel brand mark (2026-09-04, "update logo/icon
              everywhere") — was a generic Lucide ShieldCheck standing in
              for the actual logo, the one real gap in an otherwise
              consistent icon.png/storefront-header rollout. This keeps the
              default gradientId; the phone top bar in app/admin/layout.tsx
              mounts a second BrandMark and passes its own id, so the two
              never share a <defs> id. */}
          <BrandMark className="h-6 w-6 shrink-0" />
          <span className={`truncate text-sm font-bold text-stone-900 ${collapsed ? "lg:hidden" : ""}`}>Solar Pixel</span>
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="Close menu"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-50 hover:text-stone-900 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {items.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-3 text-sm font-medium transition-colors duration-150 lg:py-2 ${
                  collapsed ? "lg:justify-center" : ""
                } ${active ? "bg-violet-50 text-violet-700" : "text-stone-500 hover:bg-stone-50 hover:text-stone-900"}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-stone-100 p-2">
          {viewer && (
            <p className={`truncate px-2.5 pb-1.5 text-[11px] text-stone-400 ${collapsed ? "lg:hidden" : ""}`}>
              {viewer.kind === "SUPER_ADMIN" ? "Super Admin" : viewer.name}
            </p>
          )}
          <button
            type="button"
            onClick={onLogout}
            title={collapsed ? "Log out" : undefined}
            className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-3 text-sm font-medium text-stone-500 transition-colors duration-150 hover:bg-red-50 hover:text-red-600 lg:py-2 ${
              collapsed ? "lg:justify-center" : ""
            }`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={collapsed ? "lg:hidden" : ""}>Log out</span>
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={`mt-1 hidden w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-stone-400 transition-colors duration-150 hover:bg-stone-50 hover:text-stone-700 lg:flex ${
              collapsed ? "lg:justify-center" : ""
            }`}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4 shrink-0" /> : <ChevronsLeft className="h-4 w-4 shrink-0" />}
            <span className={collapsed ? "lg:hidden" : ""}>Collapse</span>
          </button>
        </div>
      </aside>
    </>
  );
}
