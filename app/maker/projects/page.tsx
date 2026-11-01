"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
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
        <header className={view.kind === "list" ? "mb-5" : "mb-1"}>
          <div className="mb-1.5 flex items-center gap-1.5">
            <BrandMark className="h-4 w-4 shrink-0" />
            <p className="text-xs font-medium text-[var(--color-neon)]">Solar Pixel · Labour Head</p>
          </div>
          {view.kind === "list" && (
            <>
              <h1 className="mt-0.5 text-xl font-bold text-[var(--color-ink)]">Site Projects</h1>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                Send a quotation for each site, start once prices are agreed, and get paid when it ends.
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
            </>
          )}
        </header>

        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {me && !changingName ? (
          view.kind === "list" && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-amber)] text-sm font-bold text-[var(--color-amber-ink)]"
                >
                  {me.name.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] text-[var(--color-ink-faint)]">Projects for</p>
                  <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{me.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChangingName(true)}
                className="flex min-h-11 items-center px-2 text-xs font-medium text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
              >
                Change
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

/** Where each status sits for the labour head: their move, the admin's move, or finished. */
const YOUR_TURN: SiteProjectStatus[] = ["ASSIGNED", "REVISION_REQUESTED", "COUNTER_OFFERED", "APPROVED", "IN_PROGRESS"];
const WITH_ADMIN: SiteProjectStatus[] = ["SUBMITTED", "COMPLETED"];

function nextStep(p: SiteProjectDTO): { text: string; tone: string } {
  const muted = "text-[var(--color-ink-muted)]";
  switch (p.status) {
    case "ASSIGNED":
      return { text: "Send your quotation", tone: "text-indigo-700" };
    case "REVISION_REQUESTED":
      return { text: "Fix your quotation", tone: "text-orange-700" };
    case "COUNTER_OFFERED":
      return { text: "The admin sent an offer. Answer it", tone: "text-teal-700" };
    case "APPROVED":
      return { text: "Prices agreed. Start the site", tone: "text-emerald-700" };
    case "IN_PROGRESS":
      return { text: "Site running. End it when done", tone: "text-sky-700" };
    case "SUBMITTED":
      return { text: "The admin is checking your quotation", tone: muted };
    case "COMPLETED":
      return { text: "Payout is being processed", tone: muted };
    case "PAID":
      return { text: "Paid", tone: muted };
    case "REJECTED":
      return { text: "Cancelled", tone: muted };
  }
}

function ProjectCard({ p, onOpen }: { p: SiteProjectDTO; onOpen: (id: string) => void }) {
  const step = nextStep(p);
  const urgent = YOUR_TURN.includes(p.status);
  const amount = p.payoutPKR ?? p.proposedMaterialsTotalPKR + p.proposedLabourFeePKR;
  return (
    <button
      type="button"
      onClick={() => onOpen(p.id)}
      className={`${CARD} flex w-full items-center gap-3 text-left transition active:scale-[0.99] hover:border-[var(--color-border-strong)] ${
        urgent ? "!border-[var(--color-amber)]/35" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-base font-semibold leading-snug text-[var(--color-ink)]">{p.clientName}</p>
        <p className="mt-0.5 truncate text-xs text-[var(--color-ink-faint)]">
          {p.projectNumber} · {p.city}
          {p.systemSizeKw !== null ? ` · ${p.systemSizeKw} kW` : ""}
        </p>
        <div className="mt-2.5 flex items-baseline justify-between gap-3">
          <p className={`text-sm font-semibold ${step.tone}`}>{step.text}</p>
          {amount > 0 && p.status !== "REJECTED" && (
            <p className="shrink-0 text-right text-xs tabular-nums text-[var(--color-ink-muted)]">
              {p.payoutPKR !== null ? "Payout " : "Quoted "}
              <span className="font-semibold text-[var(--color-ink)]">{formatPKR(amount)}</span>
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
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">When the admin assigns you one, it shows up here.</p>
      </div>
    );
  }

  const groups = [
    { key: "turn", title: "Your turn", accent: true, items: projects.filter((p) => YOUR_TURN.includes(p.status)) },
    { key: "admin", title: "With the admin", accent: false, items: projects.filter((p) => WITH_ADMIN.includes(p.status)) },
    { key: "done", title: "Finished", accent: false, items: projects.filter((p) => p.status === "PAID" || p.status === "REJECTED") },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.title}>
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]">
            {g.title}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] leading-none ${
                g.accent ? "bg-[var(--color-amber)] text-[var(--color-amber-ink)]" : "bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]"
              }`}
            >
              {g.items.length}
            </span>
          </h2>
          <div className="space-y-2.5">
            {g.items.map((p) => (
              <ProjectCard key={p.id} p={p} onOpen={onOpen} />
            ))}
          </div>
        </section>
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
        <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1.5 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
          <ArrowLeft className="h-4 w-4" /> All projects
        </button>
      </div>

      <div className={CARD}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-ink-faint)]">{project.projectNumber}</p>
            <h2 className="mt-0.5 text-lg font-semibold text-[var(--color-ink)]">{project.clientName}</h2>
          </div>
          <StatusBadge status={project.status} />
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
        <Stepper status={project.status} />
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

const STEPS = ["Quotation", "Agreed", "On site", "Paid"] as const;

/** Four real stages in order. Quotation covers everything until prices are agreed. */
function stepIndex(status: SiteProjectStatus): number | null {
  switch (status) {
    case "ASSIGNED":
    case "REVISION_REQUESTED":
    case "SUBMITTED":
    case "COUNTER_OFFERED":
      return 0;
    case "APPROVED":
      return 1;
    case "IN_PROGRESS":
      return 2;
    case "COMPLETED":
      return 3;
    case "PAID":
      return 4;
    case "REJECTED":
      return null;
  }
}

function Stepper({ status }: { status: SiteProjectStatus }) {
  const idx = stepIndex(status);
  if (idx === null) return null;
  return (
    <ol aria-label="Project progress" className="mt-4 flex items-start border-t border-[var(--color-border)] pt-4">
      {STEPS.map((label, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <li key={label} className="flex flex-1 items-start last:flex-none" aria-current={current ? "step" : undefined}>
            <span className="flex w-14 flex-col items-center gap-1">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  done
                    ? "bg-[var(--color-neon)] text-white"
                    : current
                      ? "bg-[var(--color-amber)] text-[var(--color-amber-ink)]"
                      : "border border-[var(--color-border-strong)] text-[var(--color-ink-faint)]"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`text-[11px] ${current ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-ink-faint)]"}`}>{label}</span>
            </span>
            {i < STEPS.length - 1 && <span className={`mt-3 h-px flex-1 ${done ? "bg-[var(--color-neon-dim)]" : "bg-[var(--color-border)]"}`} />}
          </li>
        );
      })}
    </ol>
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
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-900",
    amber: "border-amber-300 bg-amber-50 text-amber-900",
    orange: "border-orange-200 bg-orange-50 text-orange-900",
    red: "border-red-200 bg-red-50 text-red-900",
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
    <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
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

      <div className="flex items-baseline justify-between border-t border-teal-200 pt-2">
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
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-700">
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
        <HardHat className="h-4 w-4 text-[var(--color-amber)]" /> Your quotation
      </p>
      <p className="-mt-1 text-xs text-[var(--color-ink-muted)]">
        Add each item you will buy with your price, then your own service fee.
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
              <option value={CUSTOM_VALUE}>Custom item (type your own)</option>
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
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <p className={issue ? "font-medium text-red-600" : "text-transparent"} role={issue ? "alert" : undefined}>
                {issue ?? "."}
              </p>
              <p className="tabular-nums text-[var(--color-ink-muted)]">
                Line total <span className="font-semibold text-[var(--color-ink)]">{formatPKR(lineTotalPKR(Number(r.quantity) || 0, Number(r.unitPrice) || 0))}</span>
              </p>
            </div>
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
          <Plus className="h-4 w-4" /> Add item
        </button>
        <button
          type="button"
          onClick={() => {
            setRows((prev) => [...prev, emptyRow(nextKey, true)]);
            setNextKey((k) => k + 1);
          }}
          className={BTN_GHOST}
        >
          <Plus className="h-4 w-4" /> Custom item
        </button>
      </div>

      <div>
        <label htmlFor="service-fee" className="mb-1 block text-[11px] text-[var(--color-ink-faint)]">
          Your service fee (Rs): labour, survey, transport and your own charges
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
            <p className="text-[11px] text-[var(--color-ink-muted)]">
              Quotation total · {rows.length} {rows.length === 1 ? "item" : "items"}
            </p>
            <p className="text-lg font-bold tabular-nums leading-tight text-[var(--color-ink)]">{formatPKR(total + (Number(fee) || 0))}</p>
            <p className="text-[11px] tabular-nums text-[var(--color-ink-faint)]">
              Materials {formatPKR(total)} + fee {formatPKR(Number(fee) || 0)}
            </p>
          </div>
          <button type="submit" disabled={busy} className={`${BTN_PRIMARY} !w-auto shrink-0 px-5`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {project.status === "REVISION_REQUESTED" ? "Resubmit" : "Send"}
          </button>
        </div>
      </div>
    </form>
  );
}
