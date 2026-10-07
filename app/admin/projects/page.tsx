"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageSquareWarning,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";
import { EVENT_LABEL, formatDate, formatDateTime, formatPKR, StatusBadge } from "@/components/siteProjects/shared";
import { internalFetch, type ApiJson } from "@/lib/internal/access";
import {
  computePayoutPKR,
  lineTotalPKR,
  roundMoney,
  sumLinesPKR,
  SITE_PROJECT_STATUS_LABEL,
  type SiteProjectDTO,
  type SiteProjectStatus,
} from "@/lib/siteProjects/types";

const CARD = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm";
const FIELD =
  "w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200";

type Filter = "ACTION" | "ALL" | SiteProjectStatus;

/** Statuses where the ball is in the Super Admin's court. */
const NEEDS_ADMIN: SiteProjectStatus[] = ["SUBMITTED", "COMPLETED"];

const FILTER_LABEL: Record<Filter, string> = {
  ACTION: "Needs you",
  ALL: "All",
  ...SITE_PROJECT_STATUS_LABEL,
  SUBMITTED: "Awaiting approval",
  APPROVED: "Approved",
  IN_PROGRESS: "In progress",
  COMPLETED: "Payout due",
};
const FILTER_ORDER: Filter[] = ["ACTION", "ALL", "SUBMITTED", "REVISION_REQUESTED", "APPROVED", "IN_PROGRESS", "COMPLETED", "PAID", "REJECTED"];

// ============================================================================
// Page
// ============================================================================

export default function AdminProjectsPage() {
  const { onUnauthorized } = useAdminAuth();
  const [projects, setProjects] = useState<SiteProjectDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ACTION");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await internalFetch("ADMIN", "/api/admin/projects");
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<{ projects?: SiteProjectDTO[] }>;
      if (!res.ok) throw new Error(data?.error ?? "Could not load site projects.");
      setProjects(data.projects ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c = new Map<Filter, number>();
    for (const p of projects ?? []) {
      c.set(p.status, (c.get(p.status) ?? 0) + 1);
      if (NEEDS_ADMIN.includes(p.status)) c.set("ACTION", (c.get("ACTION") ?? 0) + 1);
    }
    c.set("ALL", projects?.length ?? 0);
    return c;
  }, [projects]);

  const visible = useMemo(
    () =>
      (projects ?? []).filter((p) =>
        filter === "ALL" ? true : filter === "ACTION" ? NEEDS_ADMIN.includes(p.status) : p.status === filter,
      ),
    [projects, filter],
  );
  const selected = projects?.find((p) => p.id === selectedId) ?? null;

  function replaceProject(p: SiteProjectDTO) {
    setProjects((prev) => (prev ?? []).map((x) => (x.id === p.id ? p : x)));
  }

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-violet-600">
              <ShieldCheck className="h-3.5 w-3.5" /> Solar Pixel · Super Admin
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-stone-900">Site Projects</h1>
            <p className="mt-1 text-sm text-stone-500">
              Verify your labour heads&apos; materials and prices, accept the project, then release their payout when the
              site ends.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 shadow-sm transition hover:text-stone-900 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {loadError && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </p>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          {FILTER_ORDER.map((f) => {
            const active = filter === f;
            const n = counts.get(f) ?? 0;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-violet-600 bg-violet-600 text-white"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                }`}
              >
                {FILTER_LABEL[f]}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? "bg-white/20" : "bg-stone-100"}`}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>

        {loading && !projects && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-stone-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {projects && (
          <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
            <div className={`space-y-2.5 ${selected ? "hidden xl:block" : ""}`}>
              {visible.length === 0 && (
                <div className={`${CARD} text-center text-sm text-stone-500`}>
                  {filter === "ACTION" ? "Nothing needs you right now." : "No projects in this view."}
                </div>
              )}
              {visible.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`block w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-violet-300 ${
                    selectedId === p.id ? "border-violet-500 ring-2 ring-violet-100" : "border-stone-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stone-900">{p.clientName}</p>
                      <p className="mt-0.5 truncate text-xs text-stone-500">
                        {p.projectNumber} · {p.city}
                      </p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mt-2.5 flex items-baseline justify-between text-xs text-stone-500">
                    <span className="truncate">{p.labourHead.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-stone-700">
                      {formatPKR(p.payoutPKR ?? p.proposedMaterialsTotalPKR)}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className={selected ? "" : "hidden xl:block"}>
              {selected ? (
                <ProjectReview
                  key={selected.id}
                  project={selected}
                  onBack={() => setSelectedId(null)}
                  onChanged={replaceProject}
                  onUnauthorized={onUnauthorized}
                />
              ) : (
                <div className={`${CARD} py-16 text-center text-sm text-stone-400`}>Select a project to review it.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ============================================================================
// Review panel
// ============================================================================

const digitsOnly = (v: string) => v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

function ProjectReview({
  project,
  onBack,
  onChanged,
  onUnauthorized,
}: {
  project: SiteProjectDTO;
  onBack: () => void;
  onChanged: (p: SiteProjectDTO) => void;
  onUnauthorized: (reason?: string) => void;
}) {
  const reviewable = project.status === "SUBMITTED";

  // Approved quantity/price per line, starting from the labour head's own
  // proposal (or the already-approved values once reviewed).
  const [draft, setDraft] = useState<Record<string, { qty: string; price: string }>>(() =>
    Object.fromEntries(
      project.materials.map((m) => [
        m.id,
        {
          qty: String(m.approvedQuantity ?? m.quantity),
          price: String(m.approvedUnitPricePKR ?? m.proposedUnitPricePKR),
        },
      ]),
    ),
  );
  const [labourFee, setLabourFee] = useState(project.labourFeePKR !== null ? String(project.labourFeePKR) : "");
  const [approveNote, setApproveNote] = useState("");
  const [mode, setMode] = useState<null | "REQUEST_REVISION" | "REJECT">(null);
  const [reason, setReason] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approvedTotal = sumLinesPKR(
    project.materials.map((m) => ({
      quantity: Number(draft[m.id]?.qty) || 0,
      unitPricePKR: Number(draft[m.id]?.price) || 0,
    })),
  );
  const fee = Number(labourFee) || 0;
  const payout = computePayoutPKR(approvedTotal, fee);
  const difference = roundMoney(approvedTotal - project.proposedMaterialsTotalPKR);

  async function post(path: string, body: unknown, failMessage: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await internalFetch("ADMIN", `/api/admin/projects/${project.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<{ project?: SiteProjectDTO }>;
      if (!res.ok || !data.project) return setError(data?.error ?? failMessage);
      onChanged(data.project);
      setMode(null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const approve = () =>
    post(
      "review",
      {
        decision: "APPROVE",
        labourFeePKR: fee,
        note: approveNote || null,
        materials: project.materials.map((m) => ({
          id: m.id,
          approvedQuantity: Number(draft[m.id].qty) || 0,
          approvedUnitPricePKR: Number(draft[m.id].price) || 0,
        })),
      },
      "Could not approve the project.",
    );

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 xl:hidden">
        <ArrowLeft className="h-4 w-4" /> All projects
      </button>

      <div className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-stone-400">{project.projectNumber}</p>
            <h2 className="text-lg font-semibold text-stone-900">{project.clientName}</h2>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-stone-600">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {project.siteAddress}, {project.city}
              </span>
            </p>
          </div>
          <StatusBadge status={project.status} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Fact label="Labour head" value={project.labourHead.name} />
          {project.systemSizeKw !== null && <Fact label="System size" value={`${project.systemSizeKw} kW`} />}
          {project.plannedStartDate && <Fact label="Planned start" value={formatDate(project.plannedStartDate)} />}
          {project.crewSize !== null && <Fact label="Crew" value={`${project.crewSize} people`} />}
          {project.estimatedDays !== null && <Fact label="Estimated" value={`${project.estimatedDays} days`} />}
          {project.quote && <Fact label="Customer quote" value={project.quote.quoteNumber} />}
          <Fact label="Submitted" value={formatDateTime(project.submittedAt)} />
        </dl>
        {project.scopeNotes && <p className="mt-3 whitespace-pre-line text-sm text-stone-600">{project.scopeNotes}</p>}
      </div>

      {/* Materials: proposed vs approved */}
      <div className={CARD}>
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
          {reviewable ? "Verify materials and prices" : "Materials"}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-400">
                <th className="pb-2 font-medium">Material</th>
                <th className="pb-2 font-medium">Proposed</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 font-medium">Price / unit</th>
                <th className="pb-2 text-right font-medium">Approved total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {project.materials.map((m) => {
                const d = draft[m.id];
                const qtyChanged = Number(d.qty) !== m.quantity;
                const priceChanged = Number(d.price) !== m.proposedUnitPricePKR;
                const readOnlyQty = m.approvedQuantity ?? m.quantity;
                const readOnlyPrice = m.approvedUnitPricePKR ?? m.proposedUnitPricePKR;
                return (
                  <tr key={m.id} className="align-middle">
                    <td className="py-2.5 pr-3 text-stone-900">{m.name}</td>
                    <td className="py-2.5 pr-3 text-xs tabular-nums text-stone-500">
                      {m.quantity} {m.unit} × {formatPKR(m.proposedUnitPricePKR)}
                      <br />
                      {formatPKR(lineTotalPKR(m.quantity, m.proposedUnitPricePKR))}
                    </td>
                    <td className="py-2.5 pr-2">
                      {reviewable ? (
                        <input
                          aria-label={`Approved quantity for ${m.name}`}
                          inputMode="decimal"
                          value={d.qty}
                          onChange={(e) => setDraft((prev) => ({ ...prev, [m.id]: { ...prev[m.id], qty: digitsOnly(e.target.value) } }))}
                          className={`${FIELD} w-20 ${qtyChanged ? "border-amber-400 bg-amber-50" : ""}`}
                        />
                      ) : (
                        <span className="tabular-nums">
                          {readOnlyQty} {m.unit}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2">
                      {reviewable ? (
                        <input
                          aria-label={`Approved price per unit for ${m.name}`}
                          inputMode="decimal"
                          value={d.price}
                          onChange={(e) => setDraft((prev) => ({ ...prev, [m.id]: { ...prev[m.id], price: digitsOnly(e.target.value) } }))}
                          className={`${FIELD} w-28 ${priceChanged ? "border-amber-400 bg-amber-50" : ""}`}
                        />
                      ) : (
                        <span className="tabular-nums">{formatPKR(readOnlyPrice)}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right font-medium tabular-nums text-stone-900">
                      {formatPKR(
                        reviewable
                          ? lineTotalPKR(Number(d.qty) || 0, Number(d.price) || 0)
                          : lineTotalPKR(readOnlyQty, readOnlyPrice),
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payout */}
      {reviewable && (
        <div className={CARD}>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Payout to {project.labourHead.name}</p>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Proposed materials" value={formatPKR(project.proposedMaterialsTotalPKR)} muted />
            <Row
              label="Approved materials"
              value={formatPKR(approvedTotal)}
              hint={difference === 0 ? null : `${formatPKR(Math.abs(difference))} ${difference < 0 ? "less" : "more"} than proposed`}
            />
            <div className="flex items-center justify-between gap-3">
              <dt className="text-stone-600">
                <label htmlFor="labourFee">Labour fee</label>
              </dt>
              <dd>
                <input
                  id="labourFee"
                  inputMode="decimal"
                  value={labourFee}
                  onChange={(e) => setLabourFee(digitsOnly(e.target.value))}
                  placeholder="0"
                  className={`${FIELD} w-36 text-right`}
                />
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-stone-100 pt-3">
              <dt className="font-semibold text-stone-900">Payout once the site ends</dt>
              <dd className="text-xl font-bold tabular-nums text-emerald-700">{formatPKR(payout)}</dd>
            </div>
          </dl>

          <label htmlFor="approveNote" className="mt-4 block text-xs font-medium text-stone-500">
            Note for the record (optional)
          </label>
          <input id="approveNote" value={approveNote} onChange={(e) => setApproveNote(e.target.value)} className={`${FIELD} mt-1`} />

          {mode === null ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={approve}
                disabled={busy || payout <= 0}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve and let them start
              </button>
              <button
                type="button"
                onClick={() => setMode("REQUEST_REVISION")}
                className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-300"
              >
                <MessageSquareWarning className="h-4 w-4" /> Ask for changes
              </button>
              <button
                type="button"
                onClick={() => setMode("REJECT")}
                className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
              >
                <XCircle className="h-4 w-4" /> Reject
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <label htmlFor="reason" className="block text-sm font-medium text-stone-700">
                {mode === "REJECT" ? "Why are you rejecting this project?" : "What should the labour head change?"}
              </label>
              <textarea
                id="reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={mode === "REJECT" ? "e.g. Customer cancelled" : "e.g. Cable price is too high, get a second quote"}
                className={`${FIELD} mt-1.5`}
              />
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={() => post("review", { decision: mode, note: reason }, "Could not send that.")}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60 ${
                    mode === "REJECT" ? "bg-red-600 hover:bg-red-700" : "bg-violet-600 hover:bg-violet-700"
                  }`}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === "REJECT" ? "Reject project" : "Send back"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode(null);
                    setReason("");
                  }}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {project.payoutPKR !== null && project.status !== "REJECTED" && (
        <div className={CARD}>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Agreed payout</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{formatPKR(project.payoutPKR)}</p>
          <p className="mt-1 text-xs text-stone-500">
            Approved materials {formatPKR(project.approvedMaterialsTotalPKR ?? 0)} + labour fee {formatPKR(project.labourFeePKR ?? 0)}
          </p>
        </div>
      )}

      {project.status === "COMPLETED" && (
        <div className={CARD}>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Completion report{project.completedAt ? ` · ${formatDateTime(project.completedAt)}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-stone-700">{project.completionNotes}</p>

          <label htmlFor="paymentReference" className="mt-4 block text-xs font-medium text-stone-500">
            Payment reference (optional, e.g. bank transfer or receipt number)
          </label>
          <input
            id="paymentReference"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            className={`${FIELD} mt-1 max-w-sm`}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => post("pay", { paymentReference: paymentReference || null }, "Could not mark this as paid.")}
            className="mt-3 flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
            Mark {formatPKR(project.payoutPKR ?? 0)} as paid
          </button>
        </div>
      )}

      {project.status === "PAID" && (
        <div className={CARD}>
          <p className="text-sm text-stone-700">
            Paid {project.paidAt ? formatDateTime(project.paidAt) : ""}
            {project.paymentReference ? ` · Ref ${project.paymentReference}` : ""}
          </p>
          {project.completionNotes && <p className="mt-2 whitespace-pre-line text-sm text-stone-500">{project.completionNotes}</p>}
        </div>
      )}

      {(project.status === "REVISION_REQUESTED" || project.status === "REJECTED") && project.reviewNote && (
        <div className={CARD}>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            {project.status === "REJECTED" ? "Rejected because" : "Waiting for the labour head to change"}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-stone-700">{project.reviewNote}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className={CARD}>
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Timeline</p>
        <ol className="mt-3 space-y-3">
          {project.events.map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
              <div className="min-w-0">
                <p className="text-stone-900">{EVENT_LABEL[e.type]}</p>
                <p className="text-xs text-stone-500">
                  {e.actorLabel} · {formatDateTime(e.createdAt)}
                </p>
                {e.note && <p className="mt-0.5 whitespace-pre-line text-xs text-stone-600">{e.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-stone-400">{label}</dt>
      <dd className="text-stone-900">{value}</dd>
    </div>
  );
}

function Row({ label, value, hint, muted }: { label: string; value: string; hint?: string | null; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? "text-stone-400" : "text-stone-600"}>{label}</dt>
      <dd className="text-right">
        <span className={`tabular-nums ${muted ? "text-stone-400" : "font-medium text-stone-900"}`}>{value}</span>
        {hint && <span className="block text-xs text-amber-700">{hint}</span>}
      </dd>
    </div>
  );
}
