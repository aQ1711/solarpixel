"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  HardHat,
  Loader2,
  MapPin,
  Play,
  Plus,
  Square,
  Trash2,
  Wallet,
} from "lucide-react";
import { AccessGate } from "@/components/internal/AccessGate";
import { BrandMark } from "@/components/BrandMark";
import { EVENT_LABEL, formatDate, formatDateTime, formatPKR, StatusBadge } from "@/components/siteProjects/shared";
import { internalFetch, type ApiJson } from "@/lib/internal/access";
import { lineTotalPKR, sumLinesPKR, type SiteProjectDTO } from "@/lib/siteProjects/types";

// ============================================================================
// Shared look (same tokens as the Field Engineer survey tool)
// ============================================================================

const CARD = "rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5";
const LABEL = "mb-1.5 block text-sm font-medium text-[var(--color-ink-muted)]";
const INPUT =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-amber)] focus:ring-2 focus:ring-[var(--color-amber)]/25";
const BTN_PRIMARY =
  "flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-amber)] py-3 text-sm font-semibold text-[var(--color-amber-ink)] transition hover:bg-[var(--color-amber-strong)] disabled:opacity-60";
const BTN_GHOST =
  "flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-sm font-medium text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)] disabled:opacity-60";

const LABOUR_HEAD_KEY = "solarpixel.labourHeadId";

interface Engineer {
  id: string;
  name: string;
}

type View = { kind: "list" } | { kind: "detail"; id: string };

// ============================================================================
// Page
// ============================================================================

export default function MakerProjectsPage() {
  return (
    <AccessGate role="MAKER" title="Labour Head Access">
      {({ onUnauthorized }) => <ProjectsApp onUnauthorized={onUnauthorized} />}
    </AccessGate>
  );
}

function ProjectsApp({ onUnauthorized }: { onUnauthorized: (reason?: string) => void }) {
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [engineerId, setEngineerId] = useState("");
  const [projects, setProjects] = useState<SiteProjectDTO[] | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);

  // Who am I: the shared maker token can't tell labour heads apart, so they
  // pick their own name once and the browser remembers it.
  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const res = await internalFetch("MAKER", "/api/maker/engineers");
        if (res.status === 401) return onUnauthorized();
        const data = (await res.json()) as ApiJson<{ engineers?: Engineer[] }>;
        if (!res.ok) return setError(data?.error ?? "Could not load the team list.");
        const list = data.engineers ?? [];
        setEngineers(list);
        try {
          const saved = window.localStorage.getItem(LABOUR_HEAD_KEY);
          if (saved && list.some((e) => e.id === saved)) setEngineerId(saved);
        } catch {
          /* storage blocked: they just pick again */
        }
      } catch {
        setError("Network error loading the team list.");
      }
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProjects(forEngineerId: string) {
    setError(null);
    try {
      const res = await internalFetch("MAKER", `/api/maker/projects?engineerId=${encodeURIComponent(forEngineerId)}`);
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<{ projects?: SiteProjectDTO[] }>;
      if (!res.ok) return setError(data?.error ?? "Could not load your projects.");
      setProjects(data.projects ?? []);
    } catch {
      setError("Network error. Check your connection and try again.");
    }
  }

  useEffect(() => {
    if (!engineerId) return;
    const id = setTimeout(() => {
      setProjects(null);
      void loadProjects(engineerId);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineerId]);

  // Keep the list live so an offer or approval from the admin shows up on its
  // own (every 15 s while the tab is visible, and when it regains focus).
  useEffect(() => {
    if (!engineerId) return;
    async function quietRefresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await internalFetch("MAKER", `/api/maker/projects?engineerId=${encodeURIComponent(engineerId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as ApiJson<{ projects?: SiteProjectDTO[] }>;
        const next = data.projects ?? [];
        setProjects((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
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
  }, [engineerId]);

  function chooseEngineer(id: string) {
    setEngineerId(id);
    setView({ kind: "list" });
    try {
      window.localStorage.setItem(LABOUR_HEAD_KEY, id);
    } catch {
      /* ignore */
    }
  }

  function upsertProject(p: SiteProjectDTO) {
    setProjects((prev) => [p, ...(prev ?? []).filter((x) => x.id !== p.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  const selected = view.kind === "detail" ? projects?.find((p) => p.id === view.id) ?? null : null;

  return (
    <main style={{ colorScheme: "dark" }} className="min-h-dvh bg-[var(--color-bg)] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-xl">
        <header className="mb-5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <BrandMark className="h-4 w-4 shrink-0" />
            <p className="text-xs font-medium text-[var(--color-neon)]">Solar Pixel · Labour Head</p>
          </div>
          <h1 className="mt-0.5 text-xl font-bold text-[var(--color-ink)]">Site Projects</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Open your project, enter the materials you need with their prices, and send them for approval. Start the site
            once it is approved, and get paid when it ends.
          </p>
          <nav className="mt-3 flex gap-2 text-xs font-medium">
            <span className="rounded-full bg-[var(--color-amber)] px-3 py-1.5 text-[var(--color-amber-ink)]">Site Projects</span>
            <Link
              href="/maker/survey"
              className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
            >
              Site Survey
            </Link>
          </nav>
        </header>

        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className={`${CARD} mb-4`}>
          <label htmlFor="labourHead" className={LABEL}>
            Who are you?
          </label>
          <select id="labourHead" value={engineerId} onChange={(e) => chooseEngineer(e.target.value)} className={INPUT}>
            <option value="">Select your name…</option>
            {engineers.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {engineers.length === 0 && !error && (
            <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
              No labour heads are set up yet. Ask the admin to add you under Team.
            </p>
          )}
        </div>

        {engineerId && view.kind === "list" && <ProjectList projects={projects} onOpen={(id) => setView({ kind: "detail", id })} />}

        {engineerId && view.kind === "detail" && selected && (
          <ProjectDetail
            key={selected.id}
            project={selected}
            engineerId={engineerId}
            onUnauthorized={onUnauthorized}
            onBack={() => setView({ kind: "list" })}
            onChanged={upsertProject}
          />
        )}
      </div>
    </main>
  );
}

// ============================================================================
// List
// ============================================================================

function ProjectList({ projects, onOpen }: { projects: SiteProjectDTO[] | null; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-3">
      {projects === null && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-ink-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your projects…
        </div>
      )}

      {projects?.length === 0 && (
        <div className={`${CARD} text-center`}>
          <ClipboardList className="mx-auto h-8 w-8 text-[var(--color-ink-faint)]" />
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            No projects have been assigned to you yet. When the admin adds one, it will show up here.
          </p>
        </div>
      )}

      {projects?.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onOpen(p.id)}
          className={`${CARD} block w-full text-left transition hover:border-[var(--color-border-strong)] ${
            p.status === "ASSIGNED" ? "!border-indigo-400/40" : ""
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <div className="min-w-[9rem] flex-1">
              <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{p.clientName}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--color-ink-faint)]">
                {p.projectNumber} · {p.city}
              </p>
            </div>
            <StatusBadge status={p.status} dark />
          </div>
          <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
            {p.status === "ASSIGNED" ? (
              <span className="font-semibold text-indigo-300">Tap to send your quotation</span>
            ) : p.status === "REVISION_REQUESTED" ? (
              <span className="font-semibold text-orange-300">Tap to fix your quotation</span>
            ) : p.status === "COUNTER_OFFERED" ? (
              <span className="font-semibold text-teal-300">The admin sent you an offer. Tap to answer</span>
            ) : p.status === "REJECTED" ? (
              <>This project was cancelled</>
            ) : p.payoutPKR !== null ? (
              <>
                Your payout <span className="font-semibold text-[var(--color-neon)]">{formatPKR(p.payoutPKR)}</span>
              </>
            ) : (
              <>Materials proposed {formatPKR(p.proposedMaterialsTotalPKR)}</>
            )}
          </p>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Detail
// ============================================================================

function ProjectDetail({
  project,
  engineerId,
  onUnauthorized,
  onBack,
  onChanged,
}: {
  project: SiteProjectDTO;
  engineerId: string;
  onUnauthorized: (reason?: string) => void;
  onBack: () => void;
  onChanged: (p: SiteProjectDTO) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmStart, setConfirmStart] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");

  async function siteAction(body: { action: "START" } | { action: "END"; completionNotes: string }) {
    setBusy(true);
    setError(null);
    try {
      const res = await internalFetch("MAKER", `/api/maker/projects/${project.id}/site`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engineerId, ...body }),
      });
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<{ project?: SiteProjectDTO }>;
      if (!res.ok || !data.project) return setError(data?.error ?? "Could not update the site.");
      onChanged(data.project);
      setConfirmStart(false);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const approvedTotal = project.approvedMaterialsTotalPKR;
  // The materials list is shown read-only once submitted; while the labour
  // head still has to enter (or fix) them, the editable form takes its place.
  const editingMaterials = project.status === "ASSIGNED" || project.status === "REVISION_REQUESTED";

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1.5 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
        <ArrowLeft className="h-4 w-4" /> All projects
      </button>

      <div className={CARD}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-ink-faint)]">{project.projectNumber}</p>
            <h2 className="mt-0.5 text-lg font-semibold text-[var(--color-ink)]">{project.clientName}</h2>
          </div>
          <StatusBadge status={project.status} dark />
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-sm text-[var(--color-ink-muted)]">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {project.siteAddress}, {project.city}
          </span>
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {project.systemSizeKw !== null && <Fact label="System size" value={`${project.systemSizeKw} kW`} />}
          {project.plannedStartDate && <Fact label="Planned start" value={formatDate(project.plannedStartDate)} />}
          {project.crewSize !== null && <Fact label="Crew" value={`${project.crewSize} people`} />}
          {project.estimatedDays !== null && <Fact label="Estimated" value={`${project.estimatedDays} days`} />}
          {project.quote && <Fact label="Customer quote" value={project.quote.quoteNumber} />}
        </dl>
        {project.scopeNotes && <p className="mt-3 whitespace-pre-line text-sm text-[var(--color-ink-muted)]">{project.scopeNotes}</p>}
      </div>

      {/* What happens next, depending on where the project is */}
      {project.status === "ASSIGNED" && (
        <Callout tone="indigo" title="Your turn: send your quotation">
          Add everything you will buy for this site with your price for each, plus your own service fee. The admin approves it or sends you an offer before you start.
        </Callout>
      )}

      {project.status === "SUBMITTED" && (
        <Callout tone="amber" title="Waiting for approval">
          The admin is checking your quotation. You can start the site once the prices are agreed.
        </Callout>
      )}

      {project.status === "REVISION_REQUESTED" && (
        <Callout tone="orange" title="Changes requested">
          {project.reviewNote}
        </Callout>
      )}

      {project.status === "COUNTER_OFFERED" && (
        <OfferCard project={project} engineerId={engineerId} onUnauthorized={onUnauthorized} onChanged={onChanged} />
      )}

      {project.status === "REJECTED" && (
        <Callout tone="red" title="Project cancelled">
          {project.reviewNote}
        </Callout>
      )}

      {editingMaterials && (
        <MaterialsForm project={project} engineerId={engineerId} onUnauthorized={onUnauthorized} onSubmitted={onChanged} />
      )}

      {project.payoutPKR !== null && project.status !== "REJECTED" && (
        <div className={CARD}>
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">
            <Wallet className="h-3.5 w-3.5" /> Your payout
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-neon)]">{formatPKR(project.payoutPKR)}</p>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
            Agreed materials {formatPKR(approvedTotal ?? 0)} + your service fee {formatPKR(project.labourFeePKR ?? 0)}
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            {project.status === "APPROVED" && "Released after you end the site."}
            {project.status === "IN_PROGRESS" && "Released after you end the site."}
            {project.status === "COMPLETED" && "The site has ended. Your payout is being processed."}
            {project.status === "PAID" && (
              <>
                Paid {project.paidAt ? formatDateTime(project.paidAt) : ""}
                {project.paymentReference ? ` · Ref ${project.paymentReference}` : ""}
              </>
            )}
          </p>
        </div>
      )}

      {project.status === "APPROVED" && (
        <div className={CARD}>
          <p className="text-sm font-semibold text-[var(--color-ink)]">Ready to start</p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">Tap start when your crew begins work on site.</p>
          {!confirmStart ? (
            <button type="button" onClick={() => setConfirmStart(true)} className={`${BTN_PRIMARY} mt-3`}>
              <Play className="h-4 w-4" /> Start site
            </button>
          ) : (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setConfirmStart(false)} disabled={busy} className={BTN_GHOST}>
                Not yet
              </button>
              <button type="button" onClick={() => siteAction({ action: "START" })} disabled={busy} className={BTN_PRIMARY}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Yes, start now
              </button>
            </div>
          )}
        </div>
      )}

      {project.status === "IN_PROGRESS" && (
        <form
          className={CARD}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void siteAction({ action: "END", completionNotes });
          }}
        >
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            Site in progress{project.startedAt ? ` since ${formatDateTime(project.startedAt)}` : ""}
          </p>
          <label htmlFor="completionNotes" className={`${LABEL} mt-3`}>
            Completion report
          </label>
          <textarea
            id="completionNotes"
            rows={4}
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
            placeholder="What was installed, any leftover material, anything the admin should know…"
            className={INPUT}
          />
          <button type="submit" disabled={busy || !completionNotes.trim()} className={`${BTN_PRIMARY} mt-3`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} End site
          </button>
        </form>
      )}

      {project.status === "COMPLETED" && project.completionNotes && (
        <div className={CARD}>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">
            Your completion report{project.completedAt ? ` · ${formatDateTime(project.completedAt)}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-ink-muted)]">{project.completionNotes}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {!editingMaterials && project.status !== "COUNTER_OFFERED" && project.materials.length > 0 && (
        <div className={CARD}>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">Materials</p>
          <ul className="mt-2 divide-y divide-[var(--color-border)]">
            {project.materials.map((m) => {
              const changed =
                m.approvedQuantity !== null &&
                (m.approvedQuantity !== m.quantity || m.approvedUnitPricePKR !== m.proposedUnitPricePKR);
              return (
                <li key={m.id} className="py-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[var(--color-ink)]">{m.name}</span>
                    <span className="shrink-0 tabular-nums text-[var(--color-ink-muted)]">
                      {formatPKR(lineTotalPKR(m.quantity, m.proposedUnitPricePKR))}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-ink-faint)]">
                    {m.quantity} {m.unit} × {formatPKR(m.proposedUnitPricePKR)}
                  </p>
                  {changed && (
                    <p className="mt-0.5 text-xs text-[var(--color-neon)]">
                      Approved: {m.approvedQuantity} {m.unit} × {formatPKR(m.approvedUnitPricePKR ?? 0)} ={" "}
                      {formatPKR(lineTotalPKR(m.approvedQuantity ?? 0, m.approvedUnitPricePKR ?? 0))}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-baseline justify-between border-t border-[var(--color-border)] pt-3 text-sm">
            <span className="text-[var(--color-ink-muted)]">You proposed</span>
            <span className="font-semibold tabular-nums text-[var(--color-ink)]">{formatPKR(project.proposedMaterialsTotalPKR)}</span>
          </div>
          {approvedTotal !== null && (
            <div className="mt-1 flex items-baseline justify-between text-sm">
              <span className="text-[var(--color-ink-muted)]">Approved</span>
              <span className="font-semibold tabular-nums text-[var(--color-neon)]">{formatPKR(approvedTotal)}</span>
            </div>
          )}
        </div>
      )}

      <Timeline project={project} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-ink-faint)]">{label}</dt>
      <dd className="text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: "indigo" | "amber" | "orange" | "red";
  title: string;
  children: React.ReactNode;
}) {
  const toneClass = {
    indigo: "border-indigo-400/30 bg-indigo-400/10 text-indigo-200",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    orange: "border-orange-400/30 bg-orange-400/10 text-orange-200",
    red: "border-red-400/30 bg-red-400/10 text-red-200",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 text-sm ${toneClass}`}>
      <p className="font-semibold">{title}</p>
      <div className="mt-1 whitespace-pre-line">{children}</div>
    </div>
  );
}

function OfferCard({
  project,
  engineerId,
  onUnauthorized,
  onChanged,
}: {
  project: SiteProjectDTO;
  engineerId: string;
  onUnauthorized: (reason?: string) => void;
  onChanged: (p: SiteProjectDTO) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");

  async function respond(body: { decision: "ACCEPT" } | { decision: "DECLINE"; note: string }) {
    setBusy(true);
    setError(null);
    try {
      const res = await internalFetch("MAKER", `/api/maker/projects/${project.id}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engineerId, ...body }),
      });
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<{ project?: SiteProjectDTO }>;
      if (!res.ok || !data.project) return setError(data?.error ?? "Could not send your answer.");
      onChanged(data.project);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const offerTotal = (project.approvedMaterialsTotalPKR ?? 0) + (project.labourFeePKR ?? 0);
  const yourTotal = project.proposedMaterialsTotalPKR + project.proposedLabourFeePKR;

  return (
    <div className="space-y-3 rounded-2xl border border-teal-400/30 bg-teal-400/10 p-4 text-sm text-teal-100">
      <p className="font-semibold">The admin sent you an offer</p>
      {project.reviewNote && <p className="whitespace-pre-line">{project.reviewNote}</p>}

      <ul className="space-y-1.5">
        {project.materials.map((m) => {
          const changed = m.approvedQuantity !== m.quantity || m.approvedUnitPricePKR !== m.proposedUnitPricePKR;
          return (
            <li key={m.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                {m.name}
                <span className="block text-[11px] opacity-70">
                  {changed ? (
                    <>
                      You asked {m.quantity} {m.unit} × {formatPKR(m.proposedUnitPricePKR)}. Offer: {m.approvedQuantity} {m.unit} ×{" "}
                      {formatPKR(m.approvedUnitPricePKR ?? 0)}
                    </>
                  ) : (
                    <>
                      {m.quantity} {m.unit} × {formatPKR(m.proposedUnitPricePKR)}
                    </>
                  )}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{formatPKR(lineTotalPKR(m.approvedQuantity ?? 0, m.approvedUnitPricePKR ?? 0))}</span>
            </li>
          );
        })}
        <li className="flex items-baseline justify-between gap-3">
          <span>
            Your service fee
            {project.labourFeePKR !== project.proposedLabourFeePKR && (
              <span className="block text-[11px] opacity-70">You asked {formatPKR(project.proposedLabourFeePKR)}</span>
            )}
          </span>
          <span className="shrink-0 tabular-nums">{formatPKR(project.labourFeePKR ?? 0)}</span>
        </li>
      </ul>

      <div className="flex items-baseline justify-between border-t border-teal-400/30 pt-2">
        <span>
          Offer total
          <span className="block text-[11px] opacity-70">Your quotation was {formatPKR(yourTotal)}</span>
        </span>
        <span className="text-xl font-bold tabular-nums">{formatPKR(offerTotal)}</span>
      </div>

      {declining && (
        <div>
          <label htmlFor="decline-note" className="mb-1 block text-[11px] opacity-80">
            What would you like changed?
          </label>
          <textarea id="decline-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={INPUT} />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-300">
          {error}
        </p>
      )}

      {!declining ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => setDeclining(true)} disabled={busy} className={BTN_GHOST}>
            Ask for changes
          </button>
          <button type="button" onClick={() => respond({ decision: "ACCEPT" })} disabled={busy} className={BTN_PRIMARY}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Accept offer
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setDeclining(false)} disabled={busy} className={BTN_GHOST}>
            Back
          </button>
          <button
            type="button"
            onClick={() => respond({ decision: "DECLINE", note })}
            disabled={busy || note.trim().length === 0}
            className={BTN_PRIMARY}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send and edit my quotation
          </button>
        </div>
      )}
    </div>
  );
}

function Timeline({ project }: { project: SiteProjectDTO }) {
  return (
    <div className={CARD}>
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">Timeline</p>
      <ol className="mt-3 space-y-3">
        {project.events.map((e) => (
          <li key={e.id} className="flex gap-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-neon-dim)]" />
            <div className="min-w-0">
              <p className="text-[var(--color-ink)]">{EVENT_LABEL[e.type]}</p>
              <p className="text-xs text-[var(--color-ink-faint)]">
                {e.actorLabel} · {formatDateTime(e.createdAt)}
              </p>
              {e.note && <p className="mt-0.5 whitespace-pre-line text-xs text-[var(--color-ink-muted)]">{e.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ============================================================================
// Materials form (the only thing a labour head enters)
// ============================================================================

interface MaterialRow {
  key: number;
  name: string;
  unit: string;
  quantity: string;
  unitPrice: string;
}

const UNIT_SUGGESTIONS = ["pcs", "m", "set", "kg", "bag", "box", "roll"];
const emptyRow = (key: number): MaterialRow => ({ key, name: "", unit: "pcs", quantity: "", unitPrice: "" });
const digitsOnly = (v: string) => v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

function MaterialsForm({
  project,
  engineerId,
  onUnauthorized,
  onSubmitted,
}: {
  project: SiteProjectDTO;
  engineerId: string;
  onUnauthorized: (reason?: string) => void;
  onSubmitted: (p: SiteProjectDTO) => void;
}) {
  // After "changes requested" the earlier list comes back pre-filled to fix.
  const [rows, setRows] = useState<MaterialRow[]>(
    project.materials.length > 0
      ? project.materials.map((m, i) => ({
          key: i,
          name: m.name,
          unit: m.unit,
          quantity: String(m.quantity),
          unitPrice: String(m.proposedUnitPricePKR),
        }))
      : [emptyRow(0)],
  );
  const [nextKey, setNextKey] = useState(Math.max(project.materials.length, 1));
  const [fee, setFee] = useState(project.proposedLabourFeePKR > 0 ? String(project.proposedLabourFeePKR) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(key: number, patch: Partial<MaterialRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const total = useMemo(
    () => sumLinesPKR(rows.map((r) => ({ quantity: Number(r.quantity) || 0, unitPricePKR: Number(r.unitPrice) || 0 }))),
    [rows],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await internalFetch("MAKER", `/api/maker/projects/${project.id}/materials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engineerId,
          labourFeePKR: Number(fee) || 0,
          materials: rows.map((r) => ({
            name: r.name,
            unit: r.unit,
            quantity: Number(r.quantity),
            unitPricePKR: Number(r.unitPrice),
          })),
        }),
      });
      if (res.status === 401) return onUnauthorized();
      const data = (await res.json()) as ApiJson<{ project?: SiteProjectDTO }>;
      if (!res.ok || !data.project) return setError(data?.error ?? "Could not send the materials.");
      onSubmitted(data.project);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`${CARD} space-y-3`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
        <HardHat className="h-4 w-4 text-[var(--color-amber)]" /> Your quotation
      </p>

      {rows.map((r, i) => (
        <div key={r.key} className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="flex items-center gap-2">
            <input
              aria-label={`Material ${i + 1} name`}
              value={r.name}
              onChange={(e) => updateRow(r.key, { name: e.target.value })}
              placeholder="Material name (e.g. DC cable)"
              className={INPUT}
            />
            {rows.length > 1 && (
              <button
                type="button"
                aria-label={`Remove material ${i + 1}`}
                onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--color-ink-faint)] transition hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <label htmlFor={`qty-${r.key}`} className="mb-1 block text-[11px] text-[var(--color-ink-faint)]">
                Quantity
              </label>
              <input id={`qty-${r.key}`} inputMode="decimal" value={r.quantity} onChange={(e) => updateRow(r.key, { quantity: digitsOnly(e.target.value) })} className={INPUT} />
            </div>
            <div>
              <label htmlFor={`unit-${r.key}`} className="mb-1 block text-[11px] text-[var(--color-ink-faint)]">
                Unit
              </label>
              <input id={`unit-${r.key}`} list="unit-options" value={r.unit} onChange={(e) => updateRow(r.key, { unit: e.target.value })} className={INPUT} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor={`price-${r.key}`} className="mb-1 block text-[11px] text-[var(--color-ink-faint)]">
                Price / unit (Rs)
              </label>
              <input id={`price-${r.key}`} inputMode="decimal" value={r.unitPrice} onChange={(e) => updateRow(r.key, { unitPrice: digitsOnly(e.target.value) })} className={INPUT} />
            </div>
          </div>
          <p className="text-right text-xs tabular-nums text-[var(--color-ink-muted)]">
            Line total {formatPKR(lineTotalPKR(Number(r.quantity) || 0, Number(r.unitPrice) || 0))}
          </p>
        </div>
      ))}
      <datalist id="unit-options">
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <button
        type="button"
        onClick={() => {
          setRows((prev) => [...prev, emptyRow(nextKey)]);
          setNextKey((k) => k + 1);
        }}
        className={`${BTN_GHOST} w-full`}
      >
        <Plus className="h-4 w-4" /> Add material
      </button>

      <div>
        <label htmlFor="service-fee" className="mb-1 block text-[11px] text-[var(--color-ink-faint)]">
          Your service fee (Rs): labour, survey, transport and your own charges
        </label>
        <input id="service-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(digitsOnly(e.target.value))} className={INPUT} />
      </div>

      <div className="space-y-1 border-t border-[var(--color-border)] pt-3">
        <div className="flex items-baseline justify-between text-sm text-[var(--color-ink-muted)]">
          <span>Materials</span>
          <span className="tabular-nums">{formatPKR(total)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[var(--color-ink-muted)]">Quotation total</span>
          <span className="text-lg font-bold tabular-nums text-[var(--color-ink)]">{formatPKR(total + (Number(fee) || 0))}</span>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className={BTN_PRIMARY}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {project.status === "REVISION_REQUESTED" ? "Resubmit quotation" : "Send quotation"}
      </button>
    </form>
  );
}
