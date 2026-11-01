"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowLeftRight,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Handshake,
  HardHat,
  Hash,
  History,
  Hourglass,
  Loader2,
  MapPin,
  Pencil,
  Play,
  Plus,
  Ruler,
  Send,
  Square,
  Trash2,
  User,
  Users,
  Wallet,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { AccessGate } from "@/components/internal/AccessGate";
import { BrandMark } from "@/components/BrandMark";
import { EVENT_LABEL, formatDate, formatDateTime, formatPKR } from "@/components/siteProjects/shared";
import { internalFetch, type ApiJson } from "@/lib/internal/access";
import {
  lineTotalPKR,
  sumLinesPKR,
  type CatalogGroupDTO,
  type SiteProjectDTO,
  type SiteProjectStatus,
} from "@/lib/siteProjects/types";

// ============================================================================
// Shared look (same tokens as the Field Engineer survey tool)
// ============================================================================

const CARD = "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5";
const LABEL = "mb-1.5 block text-sm font-medium text-[var(--color-ink-muted)]";
const INPUT =
  "min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-amber)] focus:ring-2 focus:ring-[var(--color-amber)]/25";
const BTN_PRIMARY =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-amber)] py-3 text-sm font-semibold text-[var(--color-amber-ink)] transition hover:bg-[var(--color-amber-strong)] disabled:opacity-60";
const BTN_GHOST =
  "flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-sm font-medium text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)] disabled:opacity-60";

// Light look in the storefront's navy, blue-grey and orange, set on this page
// only by overriding the shared tokens, so the Survey and Checker screens keep
// their dark theme.
const LIGHT_THEME = {
  colorScheme: "light",
  "--color-bg": "#F6F8FB",
  "--color-surface": "#FFFFFF",
  "--color-surface-2": "#EDF2F8",
  "--color-border": "#D5DFEC",
  "--color-border-strong": "#B8C7DB",
  "--color-ink": "#1E3550",
  "--color-ink-muted": "#51607A",
  "--color-ink-faint": "#66758E",
  "--color-amber": "#C2571F",
  "--color-amber-strong": "#A9470F",
  "--color-amber-ink": "#FFFFFF",
  "--color-neon": "#15803D",
  "--color-neon-dim": "#7FC4A0",
} as React.CSSProperties;

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
  const [changingName, setChangingName] = useState(false);

  // Opening a project starts at its top, not wherever the list was scrolled to.
  useEffect(() => {
    if (view.kind === "detail") window.scrollTo({ top: 0 });
  }, [view]);

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
    setChangingName(false);
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
  const me = engineers.find((e) => e.id === engineerId) ?? null;

  return (
    <main style={LIGHT_THEME} className="min-h-dvh bg-[var(--color-bg)] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-xl">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark className="h-6 w-6 shrink-0" />
            <h1 className="truncate text-lg font-bold text-[var(--color-ink)]">Site Projects</h1>
          </div>
          {view.kind === "list" && (
            <Link
              href="/maker/survey"
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm font-medium text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
            >
              <ClipboardList className="h-4 w-4" /> Survey
            </Link>
          )}
        </header>

        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {me && !changingName ? (
          view.kind === "list" && (
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-2 text-base font-semibold text-[var(--color-ink)]">
                <User aria-hidden className="h-5 w-5 shrink-0 text-[var(--color-amber)]" />
                <span className="truncate">{me.name}</span>
              </p>
              <button
                type="button"
                onClick={() => setChangingName(true)}
                className="flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
              >
                <ArrowLeftRight className="h-4 w-4" /> Change
              </button>
            </div>
          )
        ) : (
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
            {changingName && (
              <button
                type="button"
                onClick={() => setChangingName(false)}
                className="mt-2 flex min-h-11 items-center text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                Cancel
              </button>
            )}
          </div>
        )}

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

/** One picture and two or three words per state, so the list reads at a glance. */
interface StateView {
  icon: LucideIcon;
  label: string;
  /** The labour head has to do something now. */
  action: boolean;
}

function stateView(status: SiteProjectStatus): StateView {
  switch (status) {
    case "ASSIGNED":
      return { icon: FileText, label: "Send quotation", action: true };
    case "REVISION_REQUESTED":
      return { icon: Pencil, label: "Fix quotation", action: true };
    case "COUNTER_OFFERED":
      return { icon: Handshake, label: "Offer for you", action: true };
    case "APPROVED":
      return { icon: Play, label: "Start site", action: true };
    case "IN_PROGRESS":
      return { icon: HardHat, label: "Site running", action: true };
    case "SUBMITTED":
      return { icon: Hourglass, label: "Waiting", action: false };
    case "COMPLETED":
      return { icon: Wallet, label: "Payment coming", action: false };
    case "PAID":
      return { icon: CheckCircle2, label: "Paid", action: false };
    case "REJECTED":
      return { icon: X, label: "Cancelled", action: false };
  }
}

/** Orange when it is the labour head's turn, green once paid, quiet otherwise. */
function StateTile({ status }: { status: SiteProjectStatus }) {
  const { icon: Icon, action } = stateView(status);
  const tone = action
    ? "bg-[var(--color-amber)] text-white"
    : status === "PAID"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]";
  return (
    <span aria-hidden className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone}`}>
      <Icon className="h-6 w-6" />
    </span>
  );
}

function ProjectCard({ p, onOpen }: { p: SiteProjectDTO; onOpen: (id: string) => void }) {
  const sv = stateView(p.status);
  const amount = p.payoutPKR ?? p.proposedMaterialsTotalPKR + p.proposedLabourFeePKR;
  return (
    <button
      type="button"
      onClick={() => onOpen(p.id)}
      className={`${CARD} flex w-full items-center gap-3.5 text-left transition active:scale-[0.99] hover:border-[var(--color-border-strong)] ${
        sv.action ? "!border-[var(--color-amber)]/45" : ""
      }`}
    >
      <StateTile status={p.status} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-base font-semibold leading-snug text-[var(--color-ink)]">{p.clientName}</p>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-[var(--color-ink-faint)]">
          <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{p.city}</span>
        </p>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <p className={`text-sm font-semibold ${sv.action ? "text-[var(--color-amber-strong)]" : "text-[var(--color-ink-muted)]"}`}>{sv.label}</p>
          {amount > 0 && p.status !== "REJECTED" && (
            <p className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-[var(--color-ink)]">
              <Banknote aria-hidden className="h-4 w-4 text-[var(--color-ink-faint)]" />
              {formatPKR(amount)}
            </p>
          )}
        </div>
      </div>
      <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-[var(--color-ink-faint)]" />
    </button>
  );
}

function ProjectList({ projects, onOpen }: { projects: SiteProjectDTO[] | null; onOpen: (id: string) => void }) {
  if (projects === null) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading your projects">
        {[0, 1].map((i) => (
          <div key={i} className={`${CARD} animate-pulse`}>
            <div className="h-4 w-2/3 rounded bg-[var(--color-surface-2)]" />
            <div className="mt-2 h-3 w-1/2 rounded bg-[var(--color-surface-2)]" />
            <div className="mt-4 h-3 w-3/4 rounded bg-[var(--color-surface-2)]" />
          </div>
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className={`${CARD} text-center`}>
        <ClipboardList className="mx-auto h-8 w-8 text-[var(--color-ink-faint)]" />
        <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">No projects yet</p>
      </div>
    );
  }

  // Projects waiting on the labour head come first.
  const ordered = [...projects].sort((a, b) => Number(stateView(b.status).action) - Number(stateView(a.status).action));

  return (
    <div className="space-y-3">
      {ordered.map((p) => (
        <ProjectCard key={p.id} p={p} onOpen={onOpen} />
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
      <div className="sticky top-0 z-20 -mx-4 bg-[var(--color-bg)]/90 px-4 backdrop-blur sm:-mx-6 sm:px-6">
        <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
          <ArrowLeft className="h-5 w-5" /> Back
        </button>
      </div>

      <div className={CARD}>
        <div className="flex items-center gap-3.5">
          <StateTile status={project.status} />
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-snug text-[var(--color-ink)]">{project.clientName}</h2>
            <p className="text-sm font-semibold text-[var(--color-ink-muted)]">{stateView(project.status).label}</p>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-sm text-[var(--color-ink-muted)]">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {project.siteAddress}, {project.city}
          </span>
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {project.systemSizeKw !== null && <Chip icon={Zap} text={`${project.systemSizeKw} kW`} />}
          {project.plannedStartDate && <Chip icon={Calendar} text={formatDate(project.plannedStartDate)} />}
          {project.crewSize !== null && <Chip icon={Users} text={String(project.crewSize)} />}
          {project.estimatedDays !== null && <Chip icon={Clock} text={`${project.estimatedDays} days`} />}
        </ul>
        {project.scopeNotes && <p className="mt-3 whitespace-pre-line text-sm text-[var(--color-ink-muted)]">{project.scopeNotes}</p>}
        <p className="mt-3 text-xs text-[var(--color-ink-faint)]">{project.projectNumber}</p>
      </div>

      {/* What happens next, depending on where the project is */}
      {project.status === "REVISION_REQUESTED" && (
        <Callout tone="orange" icon={Pencil} title="Fix your quotation">
          {project.reviewNote}
        </Callout>
      )}

      {project.status === "COUNTER_OFFERED" && (
        <OfferCard project={project} engineerId={engineerId} onUnauthorized={onUnauthorized} onChanged={onChanged} />
      )}

      {project.status === "REJECTED" && (
        <Callout tone="red" icon={X} title="Cancelled">
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
            Materials {formatPKR(approvedTotal ?? 0)} + your fee {formatPKR(project.labourFeePKR ?? 0)}
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            {project.status === "APPROVED" && "Paid after the site ends."}
            {project.status === "IN_PROGRESS" && "Paid after the site ends."}
            {project.status === "COMPLETED" && "Payment coming."}
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
          <p className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink)]">
            <Play className="h-5 w-5 text-[var(--color-amber)]" /> Ready to start
          </p>
          {!confirmStart ? (
            <button type="button" onClick={() => setConfirmStart(true)} className={`${BTN_PRIMARY} mt-3`}>
              <Play className="h-5 w-5" /> Start site
            </button>
          ) : (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setConfirmStart(false)} disabled={busy} className={BTN_GHOST}>
                Not yet
              </button>
              <button type="button" onClick={() => siteAction({ action: "START" })} disabled={busy} className={BTN_PRIMARY}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start
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
          <p className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink)]">
            <HardHat className="h-5 w-5 text-[var(--color-amber)]" /> Site running
          </p>
          {project.startedAt && <p className="mt-0.5 text-xs text-[var(--color-ink-faint)]">Since {formatDateTime(project.startedAt)}</p>}
          <label htmlFor="completionNotes" className={`${LABEL} mt-3`}>
            What was done
          </label>
          <textarea
            id="completionNotes"
            rows={4}
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
            placeholder="What was done on site"
            className={INPUT}
          />
          <button type="submit" disabled={busy || !completionNotes.trim()} className={`${BTN_PRIMARY} mt-3`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-5 w-5" />} End site
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
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
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
            <span className="text-[var(--color-ink-muted)]">You asked</span>
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

function Chip({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <li className="flex items-center gap-1.5 rounded-full bg-[var(--color-surface-2)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink)]">
      <Icon aria-hidden className="h-4 w-4 text-[var(--color-amber)]" />
      {text}
    </li>
  );
}

function Callout({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "orange" | "red";
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  const toneClass = {
    orange: "border-orange-200 bg-orange-50 text-orange-900",
    red: "border-red-200 bg-red-50 text-red-900",
  }[tone];
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${toneClass}`}>
      <Icon aria-hidden className="mt-0.5 h-6 w-6 shrink-0" />
      <div className="min-w-0">
        <p className="text-base font-semibold">{title}</p>
        <div className="mt-0.5 whitespace-pre-line">{children}</div>
      </div>
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
    <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
      <p className="flex items-center gap-2 text-base font-semibold">
        <Handshake className="h-6 w-6" /> Offer for you
      </p>
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
            Your fee
            {project.labourFeePKR !== project.proposedLabourFeePKR && (
              <span className="block text-[11px] opacity-70">You asked {formatPKR(project.proposedLabourFeePKR)}</span>
            )}
          </span>
          <span className="shrink-0 tabular-nums">{formatPKR(project.labourFeePKR ?? 0)}</span>
        </li>
      </ul>

      <div className="flex items-baseline justify-between border-t border-teal-200 pt-2">
        <span>
          Offer total
          <span className="block text-[11px] opacity-70">You asked {formatPKR(yourTotal)}</span>
        </span>
        <span className="text-xl font-bold tabular-nums">{formatPKR(offerTotal)}</span>
      </div>

      {declining && (
        <div>
          <label htmlFor="decline-note" className="mb-1 block text-[11px] opacity-80">
            What should change?
          </label>
          <textarea id="decline-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={INPUT} />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-700">
          {error}
        </p>
      )}

      {!declining ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => setDeclining(true)} disabled={busy} className={BTN_GHOST}>
            <Pencil className="h-4 w-4" /> Change
          </button>
          <button type="button" onClick={() => respond({ decision: "ACCEPT" })} disabled={busy} className={BTN_PRIMARY}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} Accept
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
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
          </button>
        </div>
      )}
    </div>
  );
}

function Timeline({ project }: { project: SiteProjectDTO }) {
  return (
    <details className={`${CARD} group`}>
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[var(--color-ink)] marker:content-none">
        <History aria-hidden className="h-5 w-5 text-[var(--color-ink-muted)]" />
        <span className="flex-1">History</span>
        <ChevronDown aria-hidden className="h-4 w-4 text-[var(--color-ink-faint)] transition-transform group-open:rotate-180" />
      </summary>
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
    </details>
  );
}

// ============================================================================
// Materials form (the only thing a labour head enters)
// ============================================================================

interface MaterialRow {
  key: number;
  /** "GROUP::CODE" for a catalog item, "" while nothing is chosen yet. */
  itemKey: string;
  /** A line typed by hand instead of picked from the catalog. */
  custom: boolean;
  name: string;
  unit: string;
  quantity: string;
  unitPrice: string;
}

const CUSTOM_VALUE = "__custom__";
const UNIT_SUGGESTIONS = ["pcs", "m", "set", "kg", "bag", "box", "roll"];
const emptyRow = (key: number, custom = false): MaterialRow => ({ key, itemKey: "", custom, name: "", unit: "pcs", quantity: "", unitPrice: "" });
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
          itemKey: m.itemGroup && m.itemCode ? `${m.itemGroup}::${m.itemCode}` : "",
          custom: !(m.itemGroup && m.itemCode),
          name: m.name,
          unit: m.unit,
          quantity: String(m.quantity),
          unitPrice: String(m.proposedUnitPricePKR),
        }))
      : [emptyRow(0)],
  );
  const [nextKey, setNextKey] = useState(Math.max(project.materials.length, 1));
  const [fee, setFee] = useState(project.proposedLabourFeePKR > 0 ? String(project.proposedLabourFeePKR) : "");
  const [catalog, setCatalog] = useState<CatalogGroupDTO[]>([]);

  // The same item list the admin pricing page has (names only, no prices).
  useEffect(() => {
    let cancelled = false;
    internalFetch("MAKER", "/api/maker/projects/catalog")
      .then(async (res) => {
        if (res.status === 401) return onUnauthorized();
        const data = (await res.json()) as ApiJson<{ groups?: CatalogGroupDTO[] }>;
        if (!cancelled && res.ok) setCatalog(data.groups ?? []);
      })
      .catch(() => {
        /* the picker just stays empty; custom items still work */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickItem(key: number, value: string) {
    if (value === "") return updateRow(key, { itemKey: "", custom: false, name: "" });
    if (value === CUSTOM_VALUE) return updateRow(key, { itemKey: "", custom: true, name: "" });
    const [group, code] = value.split("::");
    const g = catalog.find((x) => x.group === group);
    const item = g?.items.find((x) => x.code === code);
    if (!g || !item) return;
    updateRow(key, { itemKey: value, custom: false, name: `${g.label}: ${item.label}`, unit: g.defaultUnit });
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A line is ready when it has an item, a quantity and a price (the same
  // rules the server enforces). Problems only show once they press Send.
  const [showIssues, setShowIssues] = useState(false);
  function lineIssue(r: MaterialRow): string | null {
    if (r.name.trim() === "") return "Choose an item";
    if (!(Number(r.quantity) > 0)) return "Enter a quantity";
    if (!(Number(r.unitPrice) > 0)) return "Enter the price";
    return null;
  }

  function updateRow(key: number, patch: Partial<MaterialRow>) {
    setError(null);
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const total = useMemo(
    () => sumLinesPKR(rows.map((r) => ({ quantity: Number(r.quantity) || 0, unitPricePKR: Number(r.unitPrice) || 0 }))),
    [rows],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const issues = rows.map(lineIssue);
    const firstBad = issues.findIndex((x) => x !== null);
    if (firstBad !== -1) {
      setShowIssues(true);
      setError(`Item ${firstBad + 1}: ${issues[firstBad]}.`);
      document.getElementById(`row-${rows[firstBad].key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
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
            itemGroup: r.itemKey ? r.itemKey.split("::")[0] : null,
            itemCode: r.itemKey ? r.itemKey.split("::")[1] : null,
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
        <FileText className="h-5 w-5 text-[var(--color-amber)]" /> Your quotation
      </p>

      {rows.map((r, i) => {
        const issue = showIssues ? lineIssue(r) : null;
        return (
          <div
            key={r.key}
            id={`row-${r.key}`}
            className={`scroll-mt-20 space-y-2 rounded-2xl border bg-[var(--color-surface-2)] p-3 ${
              issue ? "border-red-400" : "border-[var(--color-border)]"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]">Item {i + 1}</p>
              {rows.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove item ${i + 1}`}
                  onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                  className="-mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-ink-faint)] transition hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <select
              aria-label={`Item ${i + 1}`}
              value={r.custom ? CUSTOM_VALUE : r.itemKey}
              onChange={(e) => pickItem(r.key, e.target.value)}
              className={INPUT}
            >
              <option value="">Choose an item…</option>
              {catalog.map((g) => (
                <optgroup key={g.group} label={g.label}>
                  {g.items.map((it) => (
                    <option key={`${g.group}::${it.code}`} value={`${g.group}::${it.code}`}>
                      {it.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value={CUSTOM_VALUE}>Other (type the name)</option>
            </select>
            {r.custom && (
              <input
                aria-label={`Custom item ${i + 1} name`}
                value={r.name}
                onChange={(e) => updateRow(r.key, { name: e.target.value })}
                placeholder="Item name"
                className={INPUT}
              />
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div>
                <label htmlFor={`qty-${r.key}`} className="mb-1 flex items-center gap-1 text-xs font-medium text-[var(--color-ink-muted)]">
                  <Hash aria-hidden className="h-3.5 w-3.5" /> Qty
                </label>
                <input id={`qty-${r.key}`} inputMode="decimal" value={r.quantity} onChange={(e) => updateRow(r.key, { quantity: digitsOnly(e.target.value) })} className={INPUT} />
              </div>
              <div>
                <label htmlFor={`unit-${r.key}`} className="mb-1 flex items-center gap-1 text-xs font-medium text-[var(--color-ink-muted)]">
                  <Ruler aria-hidden className="h-3.5 w-3.5" /> Unit
                </label>
                <input id={`unit-${r.key}`} list="unit-options" value={r.unit} onChange={(e) => updateRow(r.key, { unit: e.target.value })} className={INPUT} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor={`price-${r.key}`} className="mb-1 flex items-center gap-1 text-xs font-medium text-[var(--color-ink-muted)]">
                  <Banknote aria-hidden className="h-3.5 w-3.5" /> Rs each
                </label>
                <input id={`price-${r.key}`} inputMode="decimal" value={r.unitPrice} onChange={(e) => updateRow(r.key, { unitPrice: digitsOnly(e.target.value) })} className={INPUT} />
              </div>
            </div>
            <p className="flex min-h-5 items-center justify-end text-sm" role={issue ? "alert" : undefined}>
              {issue ? (
                <span className="font-medium text-red-600">{issue}</span>
              ) : (
                Number(r.quantity) > 0 &&
                Number(r.unitPrice) > 0 && (
                  <span className="font-semibold tabular-nums text-[var(--color-ink)]">
                    = {formatPKR(lineTotalPKR(Number(r.quantity), Number(r.unitPrice)))}
                  </span>
                )
              )}
            </p>
          </div>
        );
      })}
      <datalist id="unit-options">
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setRows((prev) => [...prev, emptyRow(nextKey)]);
            setNextKey((k) => k + 1);
          }}
          className={BTN_GHOST}
        >
          <Plus className="h-4 w-4" /> Item
        </button>
        <button
          type="button"
          onClick={() => {
            setRows((prev) => [...prev, emptyRow(nextKey, true)]);
            setNextKey((k) => k + 1);
          }}
          className={BTN_GHOST}
        >
          <Pencil className="h-4 w-4" /> Other
        </button>
      </div>

      <div>
        <label htmlFor="service-fee" className="mb-1 flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-muted)]">
          <Wrench aria-hidden className="h-4 w-4" /> Your fee (Rs)
        </label>
        <input id="service-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(digitsOnly(e.target.value))} className={INPUT} />
      </div>

      {/* Stays at the bottom of the screen while they fill in the lines, so
          the running total and the Send button are never a long scroll away. */}
      <div className="sticky bottom-3 z-10 -mx-1 rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg)]/90 p-3 shadow-xl backdrop-blur">
        {error && (
          <p role="alert" className="mb-2 rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-muted)]">
              <Banknote aria-hidden className="h-4 w-4" /> Total
            </p>
            <p className="text-xl font-bold tabular-nums leading-tight text-[var(--color-ink)]">{formatPKR(total + (Number(fee) || 0))}</p>
          </div>
          <button type="submit" disabled={busy} className={`${BTN_PRIMARY} !w-auto shrink-0 px-6`}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            {project.status === "REVISION_REQUESTED" ? "Resubmit" : "Send"}
          </button>
        </div>
      </div>
    </form>
  );
}
