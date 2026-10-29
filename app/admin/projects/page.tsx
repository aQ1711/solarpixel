"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageSquareWarning,
  Pencil,
  Plus,
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
  type ProjectOptionsDTO,
  type SiteProjectDTO,
  type SiteProjectStatus,
} from "@/lib/siteProjects/types";

const CARD = "rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5";
const FIELD =
  "w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2.5 text-sm sm:py-1.5 text-stone-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200";

/** One shared column template so the header row and every material row line up (sm+). */
const MATERIAL_GRID = "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_5rem_7.5rem_6.5rem]";

type Filter = "ACTION" | "ALL" | SiteProjectStatus;

/** Before the prices are approved: details are still editable. */
const PRE_APPROVAL: SiteProjectStatus[] = ["ASSIGNED", "SUBMITTED", "REVISION_REQUESTED", "COUNTER_OFFERED"];

/** Statuses where the ball is in the Super Admin's court. */
const NEEDS_ADMIN: SiteProjectStatus[] = ["SUBMITTED", "COMPLETED"];

const FILTER_LABEL: Record<Filter, string> = {
  ACTION: "Needs you",
  ALL: "All",
  ...SITE_PROJECT_STATUS_LABEL,
  SUBMITTED: "Awaiting approval",
  COUNTER_OFFERED: "Offer sent",
  APPROVED: "Prices agreed",
  IN_PROGRESS: "In progress",
  COMPLETED: "Payout due",
};
const FILTER_ORDER: Filter[] = ["ACTION", "ALL", "ASSIGNED", "SUBMITTED", "REVISION_REQUESTED", "COUNTER_OFFERED", "APPROVED", "IN_PROGRESS", "COMPLETED", "PAID", "REJECTED"];

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
  // null = the list/detail view; otherwise the create/edit form is showing.
  const [formMode, setFormMode] = useState<null | { editing: SiteProjectDTO | null }>(null);
  const [options, setOptions] = useState<ProjectOptionsDTO | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  async function openForm(editing: SiteProjectDTO | null) {
    setFormMode({ editing });
    setOptionsError(null);
    try {
      const res = await internalFetch("ADMIN", "/api/admin/projects/options");
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<Partial<ProjectOptionsDTO>>;
      if (!res.ok) return setOptionsError(data?.error ?? "Could not load the labour heads.");
      setOptions({ labourHeads: data.labourHeads ?? [], quotes: data.quotes ?? [] });
    } catch {
      setOptionsError("Network error. Please try again.");
    }
  }

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

  // Keep the list live: a labour head's submission or answer shows up on its
  // own (every 15 s while the tab is visible, and as soon as it regains focus)
  // without flashing the loading state or touching the screen unless
  // something actually changed.
  useEffect(() => {
    async function quietRefresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await internalFetch("ADMIN", "/api/admin/projects");
        if (!res.ok) return;
        const data = (await res.json()) as ApiJson<{ projects?: SiteProjectDTO[] }>;
        const next = data.projects ?? [];
        setProjects((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      } catch {
        /* a missed poll is harmless; the next one retries */
      }
    }
    const timer = setInterval(quietRefresh, 15_000);
    document.addEventListener("visibilitychange", quietRefresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", quietRefresh);
    };
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
    <main className="min-h-dvh bg-stone-50 px-4 py-4 sm:px-8 sm:py-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-violet-600">
              <ShieldCheck className="h-3.5 w-3.5" /> Solar Pixel · Super Admin
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-stone-900">Site Projects</h1>
            <p className={`mt-1 text-sm text-stone-500 ${selected ? "hidden xl:block" : ""}`}>
              Add a project for a labour head, who enters the materials. Verify their prices, accept it, then release
              their payout when the site ends.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex min-h-10 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 shadow-sm transition hover:text-stone-900 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => openForm(null)}
              className="flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700"
            >
              <Plus className="h-3.5 w-3.5" />
              New project
            </button>
          </div>
        </header>

        {loadError && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </p>
        )}

        <div
          className={`-mx-4 mb-4 gap-2 overflow-x-auto px-4 pb-1 sm:-mx-8 sm:px-8 xl:mx-0 xl:flex xl:flex-wrap xl:overflow-visible xl:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            selected || formMode ? "hidden" : "flex"
          }`}
        >
          {FILTER_ORDER.map((f) => {
            const active = filter === f;
            const n = counts.get(f) ?? 0;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={active}
                className={`flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
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

        {formMode && (
          <ProjectForm
            key={formMode.editing?.id ?? "new"}
            editing={formMode.editing}
            options={options}
            optionsError={optionsError}
            onUnauthorized={onUnauthorized}
            onCancel={() => setFormMode(null)}
            onSaved={(p) => {
              setProjects((prev) => [p, ...(prev ?? []).filter((x) => x.id !== p.id)]);
              setSelectedId(p.id);
              // A brand-new project is "Waiting for materials", which the
              // default "Needs you" view hides, so jump to where it shows.
              if (!formMode.editing) setFilter("ASSIGNED");
              setFormMode(null);
            }}
          />
        )}

        {projects && !formMode && (
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
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
                    <div className="min-w-[10rem] flex-1">
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
                      {p.status === "ASSIGNED" ? "No quotation yet" : formatPKR(p.payoutPKR ?? p.proposedMaterialsTotalPKR + p.proposedLabourFeePKR)}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className={selected ? "" : "hidden xl:block"}>
              {selected ? (
                <ProjectReview
                  // Rebuild the editable lines whenever the labour head's
                  // quotation or the status changes (a resubmit replaces the
                  // material rows with new ids).
                  key={`${selected.id}:${selected.status}:${selected.materials.map((m) => m.id).join(",")}`}
                  project={selected}
                  onBack={() => setSelectedId(null)}
                  onEdit={() => openForm(selected)}
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
  onEdit,
  onChanged,
  onUnauthorized,
}: {
  project: SiteProjectDTO;
  onBack: () => void;
  onEdit: () => void;
  onChanged: (p: SiteProjectDTO) => void;
  onUnauthorized: (reason?: string) => void;
}) {
  const reviewable = project.status === "SUBMITTED" || project.status === "COUNTER_OFFERED";
  const canApprove = project.status === "SUBMITTED";

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
  const [labourFee, setLabourFee] = useState(
    project.labourFeePKR !== null
      ? String(project.labourFeePKR)
      : project.proposedLabourFeePKR > 0
        ? String(project.proposedLabourFeePKR)
        : "",
  );
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

  const counterOffer = () =>
    post(
      "review",
      {
        decision: "COUNTER_OFFER",
        labourFeePKR: fee,
        note: approveNote || null,
        materials: project.materials.map((m) => ({
          id: m.id,
          approvedQuantity: Number(draft[m.id].qty) || 0,
          approvedUnitPricePKR: Number(draft[m.id].price) || 0,
        })),
      },
      "Could not send the offer.",
    );

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 xl:hidden">
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
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={project.status} />
            {PRE_APPROVAL.includes(project.status) && (
              <button
                type="button"
                onClick={onEdit}
                className="flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit details
              </button>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Fact label="Labour head" value={project.labourHead.name} />
          {project.systemSizeKw !== null && <Fact label="System size" value={`${project.systemSizeKw} kW`} />}
          {project.plannedStartDate && <Fact label="Planned start" value={formatDate(project.plannedStartDate)} />}
          {project.crewSize !== null && <Fact label="Crew" value={`${project.crewSize} people`} />}
          {project.estimatedDays !== null && <Fact label="Estimated" value={`${project.estimatedDays} days`} />}
          {project.quote && <Fact label="Customer quote" value={project.quote.quoteNumber} />}
          <Fact label="Created" value={formatDateTime(project.createdAt)} />
          {project.submittedAt && <Fact label="Materials submitted" value={formatDateTime(project.submittedAt)} />}
        </dl>
        {project.scopeNotes && <p className="mt-3 whitespace-pre-line text-sm text-stone-600">{project.scopeNotes}</p>}
      </div>

      {/* Waiting for the labour head, or revision requested: the admin's only
          options here are to cancel (everything else is the labour head's move). */}
      {(project.status === "ASSIGNED" || project.status === "REVISION_REQUESTED") && (
        <CancelCard project={project} onChanged={onChanged} onUnauthorized={onUnauthorized} />
      )}

      {/* Materials: proposed vs approved */}
      {project.materials.length > 0 && (
      <div className={CARD}>
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
          {reviewable ? "Verify the quotation" : "Materials"}
        </p>
        <div className="mt-3">
          <div className={`hidden gap-3 pb-2 text-xs font-medium text-stone-400 sm:grid ${MATERIAL_GRID}`}>
            <span>Material</span>
            <span>Proposed</span>
            <span>Qty</span>
            <span>Price / unit</span>
            <span className="text-right">Approved total</span>
          </div>
          <ul className="divide-y divide-stone-100">
            {project.materials.map((m) => {
              const d = draft[m.id];
              const qtyChanged = Number(d.qty) !== m.quantity;
              const priceChanged = Number(d.price) !== m.proposedUnitPricePKR;
              const readOnlyQty = m.approvedQuantity ?? m.quantity;
              const readOnlyPrice = m.approvedUnitPricePKR ?? m.proposedUnitPricePKR;
              const approvedLine = formatPKR(
                reviewable ? lineTotalPKR(Number(d.qty) || 0, Number(d.price) || 0) : lineTotalPKR(readOnlyQty, readOnlyPrice),
              );
              // Phones: name + total on top, proposal underneath, then the
              // two editable fields side by side. sm+: one table-like row.
              return (
                <li key={m.id} className={`grid grid-cols-2 gap-x-3 gap-y-2 py-3 sm:items-center ${MATERIAL_GRID}`}>
                  <div className="col-span-2 flex items-start justify-between gap-3 sm:col-span-1 sm:block">
                    <p className="min-w-0 text-sm font-medium text-stone-900 sm:font-normal">{m.name}</p>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-stone-900 sm:hidden">{approvedLine}</p>
                  </div>
                  <p className="col-span-2 text-xs tabular-nums text-stone-500 sm:col-span-1">
                    <span className="sm:hidden">Proposed </span>
                    {m.quantity} {m.unit} × {formatPKR(m.proposedUnitPricePKR)}
                    <span className="hidden sm:inline">
                      <br />
                    </span>
                    <span className="sm:hidden"> = </span>
                    {formatPKR(lineTotalPKR(m.quantity, m.proposedUnitPricePKR))}
                  </p>
                  <div>
                    <label htmlFor={`q-${m.id}`} className="mb-1 block text-[11px] text-stone-400 sm:sr-only">
                      Approved qty
                    </label>
                    {reviewable ? (
                      <input
                        id={`q-${m.id}`}
                        aria-label={`Approved quantity for ${m.name}`}
                        inputMode="decimal"
                        value={d.qty}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [m.id]: { ...prev[m.id], qty: digitsOnly(e.target.value) } }))}
                        className={`${FIELD} ${qtyChanged ? "border-amber-400 bg-amber-50" : ""}`}
                      />
                    ) : (
                      <p id={`q-${m.id}`} className="text-sm tabular-nums text-stone-900">
                        {readOnlyQty} {m.unit}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor={`p-${m.id}`} className="mb-1 block text-[11px] text-stone-400 sm:sr-only">
                      Approved price / unit
                    </label>
                    {reviewable ? (
                      <input
                        id={`p-${m.id}`}
                        aria-label={`Approved price per unit for ${m.name}`}
                        inputMode="decimal"
                        value={d.price}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [m.id]: { ...prev[m.id], price: digitsOnly(e.target.value) } }))}
                        className={`${FIELD} ${priceChanged ? "border-amber-400 bg-amber-50" : ""}`}
                      />
                    ) : (
                      <p id={`p-${m.id}`} className="text-sm tabular-nums text-stone-900">
                        {formatPKR(readOnlyPrice)}
                      </p>
                    )}
                  </div>
                  <p className="hidden text-right text-sm font-medium tabular-nums text-stone-900 sm:block">{approvedLine}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      )}

      {/* Payout */}
      {reviewable && (
        <div className={CARD}>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Payout to {project.labourHead.name}</p>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Proposed materials" value={formatPKR(project.proposedMaterialsTotalPKR)} muted />
            <Row label="Proposed service fee" value={formatPKR(project.proposedLabourFeePKR)} muted />
            <Row
              label="Offered materials"
              value={formatPKR(approvedTotal)}
              hint={difference === 0 ? null : `${formatPKR(Math.abs(difference))} ${difference < 0 ? "less" : "more"} than proposed`}
            />
            <div className="flex items-center justify-between gap-3">
              <dt className="text-stone-600">
                <label htmlFor="labourFee">Service fee</label>
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
              <dt className="font-semibold text-stone-900">Total once the site ends</dt>
              <dd className="text-xl font-bold tabular-nums text-emerald-700">{formatPKR(payout)}</dd>
            </div>
          </dl>

          <label htmlFor="approveNote" className="mt-4 block text-xs font-medium text-stone-500">
            Note for the record (optional)
          </label>
          <input id="approveNote" value={approveNote} onChange={(e) => setApproveNote(e.target.value)} className={`${FIELD} mt-1`} />

          {mode === null ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {canApprove && (
                <button
                  type="button"
                  onClick={approve}
                  disabled={busy || payout <= 0}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Approve as quoted
                </button>
              )}
              <button
                type="button"
                onClick={counterOffer}
                disabled={busy || payout <= 0}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60 sm:w-auto"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareWarning className="h-4 w-4" />}
                {project.status === "COUNTER_OFFERED" ? "Update the offer" : "Send my edits as an offer"}
              </button>
              {canApprove && (
                <button
                  type="button"
                  onClick={() => setMode("REQUEST_REVISION")}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-300 sm:w-auto"
                >
                  <MessageSquareWarning className="h-4 w-4" /> Ask for changes
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode("REJECT")}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 sm:w-auto"
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
                  className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60 sm:flex-none ${
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
                  className="min-h-11 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {project.status === "COUNTER_OFFERED" && (
        <div className={CARD}>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Waiting for {project.labourHead.name} to answer your offer</p>
          {project.reviewNote && <p className="mt-1 whitespace-pre-line text-sm text-stone-700">{project.reviewNote}</p>}
        </div>
      )}

      {project.quotedBosPKR !== null && (project.payoutPKR !== null || reviewable) && project.status !== "REJECTED" && (
        <div className={CARD}>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Margin on installation work</p>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Customer quotation (cabling, structure, installation, site works)" value={formatPKR(project.quotedBosPKR)} />
            <Row
              label={project.payoutPKR !== null ? `Agreed with ${project.labourHead.name}` : `Current figure for ${project.labourHead.name}`}
              value={formatPKR(project.payoutPKR ?? payout)}
            />
            <div className="flex items-baseline justify-between border-t border-stone-100 pt-3">
              <dt className="font-semibold text-stone-900">Difference (our margin)</dt>
              <dd
                className={`text-xl font-bold tabular-nums ${
                  project.quotedBosPKR - (project.payoutPKR ?? payout) >= 0 ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {formatPKR(roundMoney(project.quotedBosPKR - (project.payoutPKR ?? payout)))}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {project.payoutPKR !== null && project.status !== "REJECTED" && (
        <div className={CARD}>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Agreed payout</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{formatPKR(project.payoutPKR)}</p>
          <p className="mt-1 text-xs text-stone-500">
            Agreed materials {formatPKR(project.approvedMaterialsTotalPKR ?? 0)} + service fee {formatPKR(project.labourFeePKR ?? 0)}
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
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60 sm:w-auto"
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

// ============================================================================
// Cancel (project still waiting on the labour head)
// ============================================================================

function CancelCard({
  project,
  onChanged,
  onUnauthorized,
}: {
  project: SiteProjectDTO;
  onChanged: (p: SiteProjectDTO) => void;
  onUnauthorized: (reason?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await internalFetch("ADMIN", `/api/admin/projects/${project.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "REJECT", note: reason }),
      });
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<{ project?: SiteProjectDTO }>;
      if (!res.ok || !data.project) return setError(data?.error ?? "Could not cancel the project.");
      onChanged(data.project);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={CARD}>
      {project.status === "ASSIGNED" && (
        <p className="text-sm text-stone-700">
          Waiting for <span className="font-semibold">{project.labourHead.name}</span> to open this project and enter the
          materials and prices.
        </p>
      )}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 sm:w-auto ${
            project.status === "ASSIGNED" ? "mt-3" : ""
          }`}
        >
          <XCircle className="h-4 w-4" /> Cancel project
        </button>
      ) : (
        <div className={`rounded-xl border border-stone-200 bg-stone-50 p-3 ${project.status === "ASSIGNED" ? "mt-3" : ""}`}>
          <label htmlFor="cancelReason" className="block text-sm font-medium text-stone-700">
            Why are you cancelling this project?
          </label>
          <textarea
            id="cancelReason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer cancelled"
            className={`${FIELD} mt-1.5`}
          />
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={cancel}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60 sm:flex-none"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancel project
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setReason("");
              }}
              className="min-h-11 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// New / edit project form
// ============================================================================

function ProjectForm({
  editing,
  options,
  optionsError,
  onUnauthorized,
  onCancel,
  onSaved,
}: {
  editing: SiteProjectDTO | null;
  options: ProjectOptionsDTO | null;
  optionsError: string | null;
  onUnauthorized: (reason?: string) => void;
  onCancel: () => void;
  onSaved: (p: SiteProjectDTO) => void;
}) {
  const [labourHeadId, setLabourHeadId] = useState(editing?.labourHead.id ?? "");
  const [quoteId, setQuoteId] = useState(editing?.quote?.id ?? "");
  const [clientName, setClientName] = useState(editing?.clientName ?? "");
  const [siteAddress, setSiteAddress] = useState(editing?.siteAddress ?? "");
  const [city, setCity] = useState(editing?.city ?? "Lahore");
  const [systemSizeKw, setSystemSizeKw] = useState(editing?.systemSizeKw?.toString() ?? "");
  const [plannedStartDate, setPlannedStartDate] = useState(editing?.plannedStartDate ?? "");
  const [crewSize, setCrewSize] = useState(editing?.crewSize?.toString() ?? "");
  const [estimatedDays, setEstimatedDays] = useState(editing?.estimatedDays?.toString() ?? "");
  const [scopeNotes, setScopeNotes] = useState(editing?.scopeNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The labour head and quote link are fixed once materials have been entered.
  const assignmentLocked = editing !== null && editing.status !== "ASSIGNED";

  function pickQuote(id: string) {
    setQuoteId(id);
    const q = options?.quotes.find((x) => x.id === id);
    if (!q) return;
    setClientName(q.clientName);
    setCity(q.city);
    if (q.address) setSiteAddress(q.address);
    setSystemSizeKw(String(q.systemKw));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await internalFetch("ADMIN", editing ? `/api/admin/projects/${editing.id}` : "/api/admin/projects", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labourHeadId,
          quoteId: quoteId || null,
          clientName,
          siteAddress,
          city,
          systemSizeKw: systemSizeKw ? Number(systemSizeKw) : null,
          plannedStartDate: plannedStartDate || null,
          crewSize: crewSize ? Number(crewSize) : null,
          estimatedDays: estimatedDays ? Number(estimatedDays) : null,
          scopeNotes: scopeNotes || null,
        }),
      });
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<{ project?: SiteProjectDTO }>;
      if (!res.ok || !data.project) return setError(data?.error ?? "Could not save the project.");
      onSaved(data.project);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const label = "mb-1 block text-xs font-medium text-stone-500";

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-4">
      <button type="button" onClick={onCancel} className="flex min-h-11 items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </button>

      <div className={`${CARD} space-y-4`}>
        <div>
          <h2 className="text-lg font-semibold text-stone-900">{editing ? "Edit project details" : "New project"}</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            {editing
              ? "The labour head sees these details. Materials and prices are entered by them."
              : "Fill in the site details and pick the labour head. They will only need to enter the materials."}
          </p>
        </div>

        {optionsError && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {optionsError}
          </p>
        )}

        <div>
          <label htmlFor="labourHeadId" className={label}>
            Labour head
          </label>
          <select
            id="labourHeadId"
            value={labourHeadId}
            onChange={(e) => setLabourHeadId(e.target.value)}
            disabled={assignmentLocked}
            required
            className={`${FIELD} disabled:bg-stone-100 disabled:text-stone-500`}
          >
            <option value="">{options ? "Select a labour head…" : "Loading…"}</option>
            {/* Keep the current labour head selectable even if they were
                deactivated since, so an edit doesn't silently blank it. */}
            {editing && !options?.labourHeads.some((l) => l.id === editing.labourHead.id) && (
              <option value={editing.labourHead.id}>{editing.labourHead.name}</option>
            )}
            {options?.labourHeads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          {options && options.labourHeads.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">No labour heads yet. Add one under Team, in the Field Engineers section.</p>
          )}
          {assignmentLocked && (
            <p className="mt-1 text-xs text-stone-400">Fixed once the labour head has entered materials.</p>
          )}
        </div>

        <div>
          <label htmlFor="quoteId" className={label}>
            Customer quote <span className="text-stone-400">(optional, fills in the details below)</span>
          </label>
          <select
            id="quoteId"
            value={quoteId}
            onChange={(e) => pickQuote(e.target.value)}
            disabled={assignmentLocked}
            className={`${FIELD} disabled:bg-stone-100 disabled:text-stone-500`}
          >
            <option value="">Not linked</option>
            {editing?.quote && !options?.quotes.some((q) => q.id === editing.quote?.id) && (
              <option value={editing.quote.id}>{editing.quote.quoteNumber}</option>
            )}
            {options?.quotes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.quoteNumber} · {q.clientName} · {q.systemKw} kW
              </option>
            ))}
          </select>
          {options && options.quotes.length === 0 && !editing?.quote && (
            <p className="mt-1 text-xs text-stone-400">No approved quotes are waiting for a site project.</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="clientName" className={label}>
              Client name
            </label>
            <input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} required className={FIELD} />
          </div>
          <div>
            <label htmlFor="city" className={label}>
              City
            </label>
            <input id="city" value={city} onChange={(e) => setCity(e.target.value)} required className={FIELD} />
          </div>
        </div>
        <div>
          <label htmlFor="siteAddress" className={label}>
            Site address
          </label>
          <input id="siteAddress" value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} required className={FIELD} />
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="systemSizeKw" className={label}>
              System size (kW)
            </label>
            <input id="systemSizeKw" inputMode="decimal" value={systemSizeKw} onChange={(e) => setSystemSizeKw(digitsOnly(e.target.value))} className={FIELD} />
          </div>
          <div>
            <label htmlFor="plannedStartDate" className={label}>
              Planned start
            </label>
            <input id="plannedStartDate" type="date" value={plannedStartDate} onChange={(e) => setPlannedStartDate(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label htmlFor="crewSize" className={label}>
              Crew size
            </label>
            <input id="crewSize" inputMode="numeric" value={crewSize} onChange={(e) => setCrewSize(digitsOnly(e.target.value))} className={FIELD} />
          </div>
          <div>
            <label htmlFor="estimatedDays" className={label}>
              Estimated days
            </label>
            <input id="estimatedDays" inputMode="numeric" value={estimatedDays} onChange={(e) => setEstimatedDays(digitsOnly(e.target.value))} className={FIELD} />
          </div>
        </div>

        <div>
          <label htmlFor="scopeNotes" className={label}>
            Scope of work <span className="text-stone-400">(optional)</span>
          </label>
          <textarea id="scopeNotes" rows={3} value={scopeNotes} onChange={(e) => setScopeNotes(e.target.value)} className={FIELD} />
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={busy || !labourHeadId}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60 sm:w-auto"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Create and assign"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 w-full rounded-xl border border-stone-200 bg-white px-5 py-2.5 text-sm font-medium text-stone-600 sm:w-auto"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
