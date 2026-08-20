"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Plus, KeyRound, Copy, Check, X, ShieldCheck, UserPlus } from "lucide-react";
import { AccessGate } from "@/components/internal/AccessGate";
import { internalFetch } from "@/lib/internal/access";

// ============================================================================
// /admin/team — Super Admin's "Manage Admins" page. Create delegated Admin
// accounts, grant/revoke which internal modules (Leads/Checker) each one
// can reach, deactivate/reactivate, and rotate a lost/compromised access
// code. Super-Admin-only (assertSuperAdminAccess server-side, on every
// route this page calls) — a regular Admin can never reach this page's
// data even if they somehow guess the URL. Light theme, matching
// /admin/leads and /admin/pricing.
// ============================================================================

type AdminModule = "LEADS" | "CHECKER";

interface AdminAccount {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  modules: AdminModule[];
}

const MODULE_LABELS: Record<AdminModule, string> = { LEADS: "Leads", CHECKER: "Checker" };
const ALL_MODULES: AdminModule[] = ["LEADS", "CHECKER"];

export default function AdminTeamPage() {
  return (
    <AccessGate role="ADMIN" title="Solar Pixel · Admin">
      {({ onUnauthorized }) => <TeamDashboard onUnauthorized={onUnauthorized} />}
    </AccessGate>
  );
}

function TeamDashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  // A just-issued/regenerated plaintext code, shown exactly once. Cleared
  // whenever the admin list reloads so it can never linger on screen.
  const [revealedCode, setRevealedCode] = useState<{ forName: string; code: string } | null>(null);

  async function loadAdmins() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await internalFetch("ADMIN", "/api/admin/team");
      if (res.status === 401) return onUnauthorized();
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not load admins.");
      setAdmins(data.admins ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(loadAdmins, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-violet-600">
              <ShieldCheck className="h-3.5 w-3.5" /> Solar Pixel · Super Admin
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-stone-900">Manage Admins</h1>
            <p className="mt-1 text-sm text-stone-500">
              {admins?.length ?? 0} delegated admin{admins?.length === 1 ? "" : "s"} · each gets their own access
              code and only reaches the modules you grant them
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadAdmins}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 shadow-sm transition hover:text-stone-900 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm((s) => !s)}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700"
            >
              <Plus className="h-3.5 w-3.5" />
              New Admin
            </button>
          </div>
        </header>

        {revealedCode && (
          <AccessCodeReveal forName={revealedCode.forName} code={revealedCode.code} onClose={() => setRevealedCode(null)} />
        )}

        {showCreateForm && (
          <CreateAdminForm
            onUnauthorized={onUnauthorized}
            onCreated={(admin, accessCode) => {
              setShowCreateForm(false);
              setRevealedCode({ forName: admin.name, code: accessCode });
              loadAdmins();
            }}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {loadError && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </p>
        )}

        {loading && !admins ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : admins && admins.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
            <UserPlus className="mx-auto mb-2 h-6 w-6 text-stone-300" />
            No delegated admins yet — create one to hand out Leads/Checker access without sharing your own code.
          </div>
        ) : (
          <div className="space-y-3">
            {admins?.map((admin) => (
              <AdminRow
                key={admin.id}
                admin={admin}
                onUnauthorized={onUnauthorized}
                onUpdated={(updated) => setAdmins((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? prev)}
                onCodeRegenerated={(code) => setRevealedCode({ forName: admin.name, code })}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

// ============================================================================
// One-time access-code reveal
// ============================================================================

function AccessCodeReveal({ forName, code, onClose }: { forName: string; code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be denied/unavailable — the code is still
      // selectable/visible in the <code> block below either way.
    }
  }

  return (
    <div className="animate-fade-up mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
          <KeyRound className="h-4 w-4" /> Access code for {forName}
        </p>
        <button type="button" onClick={onClose} className="text-amber-700 hover:text-amber-900">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-amber-800">
        Copy this now and hand it to {forName} yourself — it will not be shown again. Losing it just means
        regenerating a new one (which invalidates this one).
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <code className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-sm text-stone-900 select-all">
          {code}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Create Admin form
// ============================================================================

function CreateAdminForm({
  onUnauthorized,
  onCreated,
  onCancel,
}: {
  onUnauthorized: () => void;
  onCreated: (admin: AdminAccount, accessCode: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleModule(m: AdminModule) {
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || modules.length === 0) {
      setError("Name, phone, and at least one module are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await internalFetch("ADMIN", "/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, modules }),
      });
      if (res.status === 401) return onUnauthorized();
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not create this admin.");
        return;
      }
      onCreated(data.admin, data.accessCode);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="animate-fade-up mb-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-stone-900">New Admin</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hassan Raza"
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </Field>
        <Field label="Phone">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+923001234567"
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </Field>
        <Field label="Email (optional)">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hassan@solarpixel.pk"
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </Field>
        <Field label="Module Access">
          <div className="flex gap-2">
            {ALL_MODULES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => toggleModule(m)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                  modules.includes(m)
                    ? "border-violet-500 bg-violet-50 text-violet-700"
                    : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                }`}
              >
                {MODULE_LABELS[m]}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Create Admin
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-stone-500">{label}</span>
      {children}
    </label>
  );
}

// ============================================================================
// Existing admin row
// ============================================================================

function AdminRow({
  admin,
  onUnauthorized,
  onUpdated,
  onCodeRegenerated,
}: {
  admin: AdminAccount;
  onUnauthorized: () => void;
  onUpdated: (admin: AdminAccount) => void;
  onCodeRegenerated: (code: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await internalFetch("ADMIN", `/api/admin/team/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) return onUnauthorized();
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not update this admin.");
        return;
      }
      onUpdated(data.admin);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggleModule(m: AdminModule) {
    const next = admin.modules.includes(m) ? admin.modules.filter((x) => x !== m) : [...admin.modules, m];
    patch({ modules: next });
  }

  async function handleRegenerateCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await internalFetch("ADMIN", `/api/admin/team/${admin.id}/regenerate-code`, { method: "POST" });
      if (res.status === 401) return onUnauthorized();
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not regenerate this admin's code.");
        return;
      }
      onCodeRegenerated(data.accessCode);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm transition ${admin.isActive ? "border-stone-200" : "border-stone-200 opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-stone-900">
            {admin.name}
            {!admin.isActive && (
              <span className="ml-2 rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                DEACTIVATED
              </span>
            )}
          </p>
          <p className="text-xs text-stone-500">
            {admin.phone}
            {admin.email && ` · ${admin.email}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRegenerateCode}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-stone-600 transition hover:bg-stone-50 disabled:opacity-60"
          >
            <KeyRound className="h-3 w-3" /> Regenerate Code
          </button>
          <button
            type="button"
            onClick={() => patch({ isActive: !admin.isActive })}
            disabled={busy}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition disabled:opacity-60 ${
              admin.isActive
                ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {admin.isActive ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] text-stone-400">Modules:</span>
        {ALL_MODULES.map((m) => {
          const granted = admin.modules.includes(m);
          return (
            <button
              key={m}
              type="button"
              onClick={() => toggleModule(m)}
              disabled={busy}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-60 ${
                granted
                  ? "border-violet-200 bg-violet-50 text-violet-700"
                  : "border-stone-200 bg-stone-50 text-stone-400 hover:border-stone-300"
              }`}
            >
              {MODULE_LABELS[m]} {granted ? "✓" : "+"}
            </button>
          );
        })}
      </div>

      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
