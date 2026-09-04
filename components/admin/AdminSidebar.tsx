"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
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
 */
export function AdminSidebar({ viewer, onLogout }: { viewer: AdminViewer | null; onLogout: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const items = viewer ? ADMIN_NAV_ITEMS.filter((item) => item.allowed(viewer)) : [];

  return (
    <aside
      className={`sticky top-0 flex h-dvh shrink-0 flex-col border-r border-stone-200 bg-white transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className={`flex items-center gap-2 border-b border-stone-100 px-4 py-4 ${collapsed ? "justify-center px-0" : ""}`}>
        {/* Real Solar Pixel brand mark (2026-09-04, "update logo/icon
            everywhere") — was a generic Lucide ShieldCheck standing in
            for the actual logo, the one real gap in an otherwise
            consistent icon.png/storefront-header rollout. Own gradientId
            not needed here — this is the only BrandMark instance that
            ever mounts on an admin page (every /admin/* route shares
            this one sidebar via app/admin/layout.tsx), so no <defs> id
            collision risk. */}
        <BrandMark className="h-6 w-6 shrink-0" />
        {!collapsed && <span className="truncate text-sm font-bold text-stone-900">Solar Pixel</span>}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors duration-150 ${
                collapsed ? "justify-center" : ""
              } ${active ? "bg-violet-50 text-violet-700" : "text-stone-500 hover:bg-stone-50 hover:text-stone-900"}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-stone-100 p-2">
        {!collapsed && viewer && (
          <p className="truncate px-2.5 pb-1.5 text-[11px] text-stone-400">
            {viewer.kind === "SUPER_ADMIN" ? "Super Admin" : viewer.name}
          </p>
        )}
        <button
          type="button"
          onClick={onLogout}
          title={collapsed ? "Log out" : undefined}
          className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-stone-500 transition-colors duration-150 hover:bg-red-50 hover:text-red-600 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={`mt-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-stone-400 transition-colors duration-150 hover:bg-stone-50 hover:text-stone-700 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4 shrink-0" /> : <ChevronsLeft className="h-4 w-4 shrink-0" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
