"use client";

import { createContext, useContext, useEffect, useMemo, useState, type FormEvent } from "react";
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
import Link from "next/link";
import { AccessGate } from "@/components/internal/AccessGate";
import { BrandMark } from "@/components/BrandMark";
import { internalFetch, type ApiJson } from "@/lib/internal/access";
import { catalogEntryLabel, dateText, dateTimeText, moneyText, TEXT, type Dict, type Lang } from "@/lib/siteProjects/labourText";
import {
  lineTotalPKR,
  sumLinesPKR,
  type CatalogGroupDTO,
  type SiteProjectDTO,
  type SiteProjectStatus,
} from "@/lib/siteProjects/types";

// ============================================================================
// Look
// ============================================================================

// Light look in the storefront's navy, blue-grey and orange, set on this page
// only by overriding the shared tokens, so the Survey and Checker screens keep
// their dark theme.
const THEME = {
  colorScheme: "light",
  "--color-bg": "#F6F8FB",
  "--color-surface": "#FFFFFF",
  "--color-surface-2": "#F1F5FA",
  "--color-border": "#E3E9F2",
  "--color-border-strong": "#CBD7E6",
  "--color-ink": "#233A56",
  "--color-ink-muted": "#55657F",
  "--color-ink-faint": "#66758E",
  "--color-amber": "#F2A56F",
  "--color-amber-strong": "#D4692F",
  "--color-neon": "#2A8559",
} as React.CSSProperties;

const CARD = "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_1px_2px_rgba(30,53,80,0.05)]";
const INPUT =
  "min-h-11 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3.5 py-2.5 text-[15px] text-[var(--color-ink)] outline-none transition focus:border-[#2F4D70] focus:ring-2 focus:ring-[#2F4D70]/15";
const BTN_PRIMARY =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#2F4D70] px-4 text-[15px] font-semibold text-white transition hover:bg-[#1E3550] disabled:opacity-60";
const BTN_GHOST =
  "flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[var(--color-border-strong)] bg-white px-4 text-[15px] font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-surface-2)] disabled:opacity-60";

const LABOUR_HEAD_KEY = "solarpixel.labourHeadId";
const LANG_KEY = "solarpixel.labourLang";
const URDU_FONT_HREF = "https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap";

interface Engineer {
  id: string;
  name: string;
}

type View = { kind: "list" } | { kind: "detail"; id: string };

// ============================================================================
// Language
// ============================================================================

interface TextCtx {
  lang: Lang;
  t: Dict;
  money: (n: number) => string;
  date: (iso: string) => string;
  dateTime: (iso: string) => string;
}

const TextContext = createContext<TextCtx>({
  lang: "en",
  t: TEXT.en,
  money: (n) => moneyText("en", n),
  date: (iso) => dateText("en", iso),
  dateTime: (iso) => dateTimeText("en", iso),
});

const useText = () => useContext(TextContext);

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
  const [lang, setLangState] = useState<Lang>("ur");
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [engineerId, setEngineerId] = useState("");
  const [projects, setProjects] = useState<SiteProjectDTO[] | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);
  const [changingName, setChangingName] = useState(false);

  const ctx = useMemo<TextCtx>(
    () => ({
      lang,
      t: TEXT[lang],
      money: (n) => moneyText(lang, n),
      date: (iso) => dateText(lang, iso),
      dateTime: (iso) => dateTimeText(lang, iso),
    }),
    [lang],
  );
  const t = ctx.t;

  // Urdu is the default for labour heads; the choice is remembered on this phone.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(LANG_KEY);
        if (saved === "en" || saved === "ur") setLangState(saved);
      } catch {
        /* storage blocked: stays on the default */
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function setLang(next: Lang) {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }

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
        if (!res.ok) return setError(data?.error ?? t.errTeam);
        const list = data.engineers ?? [];
        setEngineers(list);
        try {
          const saved = window.localStorage.getItem(LABOUR_HEAD_KEY);
          if (saved && list.some((e) => e.id === saved)) setEngineerId(saved);
        } catch {
          /* storage blocked: they just pick again */
        }
      } catch {
        setError(t.errTeamNetwork);
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
      if (!res.ok) return setError(data?.error ?? t.errProjects);
      setProjects(data.projects ?? []);
    } catch {
      setError(t.errNetwork);
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
    <TextContext.Provider value={ctx}>
      <main
        dir={lang === "ur" ? "rtl" : "ltr"}
        lang={lang}
        style={THEME}
        className={`min-h-dvh bg-[var(--color-bg)] ${lang === "ur" ? "lang-ur" : ""}`}
      >
        {lang === "ur" && <link rel="stylesheet" href={URDU_FONT_HREF} />}

        <AppBar
          detailTitle={view.kind === "detail" && selected ? selected.clientName : null}
          onBack={() => setView({ kind: "list" })}
          lang={lang}
          onLang={setLang}
        />

        <div className="mx-auto max-w-xl px-4 pb-10 pt-4">
          {error && (
            <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {me && !changingName ? (
            view.kind === "list" && (
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-[var(--color-ink)]">
                  <User aria-hidden className="h-5 w-5 shrink-0 text-[var(--color-amber-strong)]" />
                  <span className="truncate">{me.name}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setChangingName(true)}
                  className="flex min-h-11 shrink-0 items-center gap-1.5 px-1 text-sm font-medium text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
                >
                  <ArrowLeftRight aria-hidden className="h-4 w-4" /> {t.change}
                </button>
              </div>
            )
          ) : (
            <div className={`${CARD} mb-4`}>
              <label htmlFor="labourHead" className="mb-1.5 block text-sm font-medium text-[var(--color-ink-muted)]">
                {t.whoAreYou}
              </label>
              <select id="labourHead" value={engineerId} onChange={(e) => chooseEngineer(e.target.value)} className={INPUT}>
                <option value="">{t.selectName}</option>
                {engineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              {engineers.length === 0 && !error && <p className="mt-2 text-xs text-[var(--color-ink-faint)]">{t.noLabourHeads}</p>}
              {changingName && (
                <button
                  type="button"
                  onClick={() => setChangingName(false)}
                  className="mt-2 flex min-h-11 items-center text-sm font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                >
                  {t.cancel}
                </button>
              )}
            </div>
          )}

          {engineerId && view.kind === "list" && <ProjectList projects={projects} onOpen={(id) => setView({ kind: "detail", id })} />}

          {engineerId && view.kind === "list" && (
            <Link href="/maker/survey" className={`${BTN_GHOST} mt-6`}>
              <ClipboardList aria-hidden className="h-4 w-4" /> {t.survey}
            </Link>
          )}

          {engineerId && view.kind === "detail" && selected && (
            <ProjectDetail
              key={selected.id}
              project={selected}
              engineerId={engineerId}
              onUnauthorized={onUnauthorized}
              onChanged={upsertProject}
            />
          )}
        </div>
      </main>
    </TextContext.Provider>
  );
}

// ============================================================================
// Top bar
// ============================================================================

function AppBar({
  detailTitle,
  onBack,
  lang,
  onLang,
}: {
  detailTitle: string | null;
  onBack: () => void;
  lang: Lang;
  onLang: (l: Lang) => void;
}) {
  const { t } = useText();
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
        {detailTitle !== null ? (
          <>
            <button
              type="button"
              onClick={onBack}
              aria-label={t.back}
              className="-ms-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--color-ink)] transition hover:bg-[var(--color-surface-2)]"
            >
              <ArrowLeft aria-hidden className="h-5 w-5 rtl:rotate-180" />
            </button>
            <p dir="auto" className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--color-ink)]">{detailTitle}</p>
          </>
        ) : (
          <>
            <BrandMark className="h-8 w-8 shrink-0" />
            {/* One line, aligned on the text baseline: stacked, the tall Urdu letters
                always sat lower than the English name beside them. */}
            <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
              <p className="shrink-0 text-[15px] font-semibold leading-none text-[var(--color-ink)]">
                <span dir="ltr">Solar Pixel</span>
              </p>
              <span aria-hidden className="h-3.5 w-px shrink-0 self-center bg-[var(--color-border-strong)]" />
              <p className={`truncate font-medium text-[var(--color-ink-muted)] ${lang === "ur" ? "text-sm leading-[1.6]" : "text-[13px] leading-none"}`}>
                {t.labourHead}
              </p>
            </div>
          </>
        )}

        <div role="group" aria-label="Language" className="flex shrink-0 rounded-full border border-[var(--color-border-strong)] bg-white p-0.5 text-sm">
          {(["ur", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => onLang(l)}
              className={`min-h-9 rounded-full px-3 font-medium transition ${lang === l ? "bg-[#2F4D70] text-white" : "text-[var(--color-ink-muted)]"}`}
            >
              {l === "ur" ? "اردو" : "EN"}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

// ============================================================================
// List
// ============================================================================

/** One picture per state, so the list reads at a glance. */
function stateIcon(status: SiteProjectStatus): { icon: LucideIcon; action: boolean } {
  switch (status) {
    case "ASSIGNED":
      return { icon: FileText, action: true };
    case "REVISION_REQUESTED":
      return { icon: Pencil, action: true };
    case "COUNTER_OFFERED":
      return { icon: Handshake, action: true };
    case "APPROVED":
      return { icon: Play, action: true };
    case "IN_PROGRESS":
      return { icon: HardHat, action: true };
    case "SUBMITTED":
      return { icon: Hourglass, action: false };
    case "COMPLETED":
      return { icon: Wallet, action: false };
    case "PAID":
      return { icon: CheckCircle2, action: false };
    case "REJECTED":
      return { icon: X, action: false };
  }
}

/** Peach when it is the labour head's turn, green once paid, quiet otherwise. */
function StateTile({ status }: { status: SiteProjectStatus }) {
  const { icon: Icon, action } = stateIcon(status);
  const tone = action
    ? "bg-[#FDEBDD] text-[var(--color-amber-strong)]"
    : status === "PAID"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]";
  return (
    <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

function ProjectCard({ p, onOpen }: { p: SiteProjectDTO; onOpen: (id: string) => void }) {
  const { t, money } = useText();
  const { action } = stateIcon(p.status);
  const amount = p.payoutPKR ?? p.proposedMaterialsTotalPKR + p.proposedLabourFeePKR;
  return (
    <button
      type="button"
      onClick={() => onOpen(p.id)}
      className={`${CARD} flex w-full items-center gap-3.5 text-start transition hover:border-[var(--color-border-strong)] active:bg-[var(--color-surface-2)] ${
        action ? "!border-[#F2C7A5]" : ""
      }`}
    >
      <StateTile status={p.status} />
      <div className="min-w-0 flex-1">
        <p dir="auto" className="line-clamp-2 text-base font-semibold text-[var(--color-ink)]">{p.clientName}</p>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-[var(--color-ink-faint)]">
          <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span dir="auto" className="truncate">{p.city}</span>
        </p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className={`text-sm font-semibold ${action ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"}`}>{t.status[p.status]}</p>
          {amount > 0 && p.status !== "REJECTED" && (
            <p className="num flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-[var(--color-ink)]">
              <Banknote aria-hidden className="h-4 w-4 text-[var(--color-ink-faint)]" />
              {money(amount)}
            </p>
          )}
        </div>
      </div>
      <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-[var(--color-ink-faint)] rtl:rotate-180" />
    </button>
  );
}

function ProjectList({ projects, onOpen }: { projects: SiteProjectDTO[] | null; onOpen: (id: string) => void }) {
  const { t } = useText();

  if (projects === null) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={t.loadingProjects}>
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
        <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">{t.noProjects}</p>
      </div>
    );
  }

  // Projects waiting on the labour head come first.
  const ordered = [...projects].sort((a, b) => Number(stateIcon(b.status).action) - Number(stateIcon(a.status).action));

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
  onChanged,
}: {
  project: SiteProjectDTO;
  engineerId: string;
  onUnauthorized: (reason?: string) => void;
  onChanged: (p: SiteProjectDTO) => void;
}) {
  const { t, money, date, dateTime } = useText();
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
      if (!res.ok || !data.project) return setError(data?.error ?? t.errSite);
      onChanged(data.project);
      setConfirmStart(false);
    } catch {
      setError(t.errNetwork);
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
      <div className={CARD}>
        <div className="flex items-center gap-3.5">
          <StateTile status={project.status} />
          <div className="min-w-0">
            <h2 dir="auto" className="text-lg font-semibold text-[var(--color-ink)]">{project.clientName}</h2>
            <p className="text-sm font-medium text-[var(--color-ink-muted)]">{t.status[project.status]}</p>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-sm text-[var(--color-ink-muted)]">
          <MapPin aria-hidden className="mt-1 h-4 w-4 shrink-0" />
          <span dir="auto">
            {project.siteAddress}, {project.city}
          </span>
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--color-ink)]">
          {project.systemSizeKw !== null && <Meta icon={Zap} text={<span dir="ltr">{project.systemSizeKw} kW</span>} />}
          {project.plannedStartDate && <Meta icon={Calendar} text={date(project.plannedStartDate)} />}
          {project.crewSize !== null && <Meta icon={Users} text={String(project.crewSize)} />}
          {project.estimatedDays !== null && <Meta icon={Clock} text={t.days(project.estimatedDays)} />}
        </ul>
        {project.scopeNotes && <p dir="auto" className="mt-3 whitespace-pre-line text-sm text-[var(--color-ink-muted)]">{project.scopeNotes}</p>}
        <p className="num mt-3 text-xs text-[var(--color-ink-faint)]" dir="ltr">
          {project.projectNumber}
        </p>
      </div>

      {project.status === "REVISION_REQUESTED" && (
        <Callout tone="orange" icon={Pencil} title={t.fixQuotation}>
          {project.reviewNote}
        </Callout>
      )}

      {project.status === "COUNTER_OFFERED" && (
        <OfferCard project={project} engineerId={engineerId} onUnauthorized={onUnauthorized} onChanged={onChanged} />
      )}

      {project.status === "REJECTED" && (
        <Callout tone="red" icon={X} title={t.cancelled}>
          {project.reviewNote}
        </Callout>
      )}

      {editingMaterials && (
        <>
          <MaterialsForm project={project} engineerId={engineerId} onUnauthorized={onUnauthorized} onSubmitted={onChanged} />
          {/* room so the docked total bar never covers the last field */}
          <div aria-hidden className="h-28" />
        </>
      )}

      {project.payoutPKR !== null && project.status !== "REJECTED" && (
        <div className={CARD}>
          <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-muted)]">
            <Wallet aria-hidden className="h-4 w-4" /> {t.payout}
          </p>
          <p className="num mt-1 text-2xl font-bold tabular-nums text-[var(--color-neon)]">{money(project.payoutPKR)}</p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {t.payoutBreakdown(money(approvedTotal ?? 0), money(project.labourFeePKR ?? 0))}
          </p>
          <p className="mt-2 text-sm font-medium text-[var(--color-ink)]">
            {project.status === "APPROVED" && t.paidAfter}
            {project.status === "IN_PROGRESS" && t.paidAfter}
            {project.status === "COMPLETED" && t.paymentComing}
            {project.status === "PAID" && t.paidOn(project.paidAt ? dateTime(project.paidAt) : "", project.paymentReference)}
          </p>
        </div>
      )}

      {project.status === "APPROVED" && (
        <div className={CARD}>
          <p className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink)]">
            <Play aria-hidden className="h-5 w-5 text-[var(--color-amber-strong)]" /> {t.readyToStart}
          </p>
          {!confirmStart ? (
            <button type="button" onClick={() => setConfirmStart(true)} className={`${BTN_PRIMARY} mt-3`}>
              <Play aria-hidden className="h-5 w-5" /> {t.startSite}
            </button>
          ) : (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setConfirmStart(false)} disabled={busy} className={BTN_GHOST}>
                {t.notYet}
              </button>
              <button type="button" onClick={() => siteAction({ action: "START" })} disabled={busy} className={BTN_PRIMARY}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play aria-hidden className="h-4 w-4" />} {t.start}
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
            <HardHat aria-hidden className="h-5 w-5 text-[var(--color-amber-strong)]" /> {t.siteRunning}
          </p>
          {project.startedAt && <p className="mt-0.5 text-xs text-[var(--color-ink-faint)]">{t.since(dateTime(project.startedAt))}</p>}
          <label htmlFor="completionNotes" className="mb-1.5 mt-3 block text-sm font-medium text-[var(--color-ink-muted)]">
            {t.whatWasDone}
          </label>
          <textarea
            id="completionNotes"
            rows={4}
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
            placeholder={t.whatWasDonePlaceholder}
            className={INPUT}
          />
          <button type="submit" disabled={busy || !completionNotes.trim()} className={`${BTN_PRIMARY} mt-3`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square aria-hidden className="h-5 w-5" />} {t.endSite}
          </button>
        </form>
      )}

      {project.status === "COMPLETED" && project.completionNotes && (
        <div className={CARD}>
          <p className="text-sm font-medium text-[var(--color-ink-muted)]">
            {t.whatWasDone}
            {project.completedAt ? ` · ${dateTime(project.completedAt)}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-ink)]">{project.completionNotes}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!editingMaterials && project.status !== "COUNTER_OFFERED" && project.materials.length > 0 && (
        <div className={CARD}>
          <p className="text-sm font-medium text-[var(--color-ink-muted)]">{t.materials}</p>
          <ul className="mt-2 divide-y divide-[var(--color-border)]">
            {project.materials.map((m) => {
              const changed =
                m.approvedQuantity !== null &&
                (m.approvedQuantity !== m.quantity || m.approvedUnitPricePKR !== m.proposedUnitPricePKR);
              return (
                <li key={m.id} className="py-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[var(--color-ink)]">{m.name}</span>
                    <span className="num shrink-0 tabular-nums text-[var(--color-ink)]">
                      {money(lineTotalPKR(m.quantity, m.proposedUnitPricePKR))}
                    </span>
                  </div>
                  <p className="num text-xs text-[var(--color-ink-faint)]">
                    {m.quantity} {m.unit} × {money(m.proposedUnitPricePKR)}
                  </p>
                  {changed && (
                    <p className="num mt-0.5 text-xs text-[var(--color-neon)]">
                      {t.approvedLine(
                        String(m.approvedQuantity),
                        m.unit,
                        money(m.approvedUnitPricePKR ?? 0),
                        money(lineTotalPKR(m.approvedQuantity ?? 0, m.approvedUnitPricePKR ?? 0)),
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-baseline justify-between border-t border-[var(--color-border)] pt-3 text-sm">
            <span className="text-[var(--color-ink-muted)]">{t.youAsked}</span>
            <span className="num font-semibold tabular-nums text-[var(--color-ink)]">{money(project.proposedMaterialsTotalPKR)}</span>
          </div>
          {approvedTotal !== null && (
            <div className="mt-1 flex items-baseline justify-between text-sm">
              <span className="text-[var(--color-ink-muted)]">{t.approved}</span>
              <span className="num font-semibold tabular-nums text-[var(--color-neon)]">{money(approvedTotal)}</span>
            </div>
          )}
        </div>
      )}

      <Timeline project={project} />
    </div>
  );
}

function Meta({ icon: Icon, text }: { icon: LucideIcon; text: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <Icon aria-hidden className="h-4 w-4 shrink-0 text-[var(--color-amber-strong)]" />
      <span>{text}</span>
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
    <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${toneClass}`}>
      <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
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
  const { t, money } = useText();
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
      if (!res.ok || !data.project) return setError(data?.error ?? t.errAnswer);
      onChanged(data.project);
    } catch {
      setError(t.errNetwork);
    } finally {
      setBusy(false);
    }
  }

  const offerTotal = (project.approvedMaterialsTotalPKR ?? 0) + (project.labourFeePKR ?? 0);
  const yourTotal = project.proposedMaterialsTotalPKR + project.proposedLabourFeePKR;

  return (
    <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
      <p className="flex items-center gap-2 text-base font-semibold">
        <Handshake aria-hidden className="h-5 w-5" /> {t.offerForYou}
      </p>
      {project.reviewNote && <p className="whitespace-pre-line">{project.reviewNote}</p>}

      <ul className="space-y-2">
        {project.materials.map((m) => {
          const changed = m.approvedQuantity !== m.quantity || m.approvedUnitPricePKR !== m.proposedUnitPricePKR;
          return (
            <li key={m.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                {m.name}
                <span className="num block text-xs opacity-75">
                  {changed
                    ? t.askedLine(String(m.quantity), m.unit, money(m.proposedUnitPricePKR), String(m.approvedQuantity), money(m.approvedUnitPricePKR ?? 0))
                    : `${m.quantity} ${m.unit} × ${money(m.proposedUnitPricePKR)}`}
                </span>
              </span>
              <span className="num shrink-0 tabular-nums">{money(lineTotalPKR(m.approvedQuantity ?? 0, m.approvedUnitPricePKR ?? 0))}</span>
            </li>
          );
        })}
        <li className="flex items-baseline justify-between gap-3">
          <span>
            {t.yourFee}
            {project.labourFeePKR !== project.proposedLabourFeePKR && (
              <span className="num block text-xs opacity-75">{t.youAskedAmount(money(project.proposedLabourFeePKR))}</span>
            )}
          </span>
          <span className="num shrink-0 tabular-nums">{money(project.labourFeePKR ?? 0)}</span>
        </li>
      </ul>

      <div className="flex items-baseline justify-between border-t border-teal-200 pt-2">
        <span>
          {t.offerTotal}
          <span className="num block text-xs opacity-75">{t.youAskedAmount(money(yourTotal))}</span>
        </span>
        <span className="num text-xl font-bold tabular-nums">{money(offerTotal)}</span>
      </div>

      {declining && (
        <div>
          <label htmlFor="decline-note" className="mb-1 block text-sm">
            {t.whatShouldChange}
          </label>
          <textarea id="decline-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={INPUT} />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}

      {!declining ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => setDeclining(true)} disabled={busy} className={BTN_GHOST}>
            <Pencil aria-hidden className="h-4 w-4" /> {t.changeButton}
          </button>
          <button type="button" onClick={() => respond({ decision: "ACCEPT" })} disabled={busy} className={BTN_PRIMARY}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 aria-hidden className="h-5 w-5" />} {t.accept}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setDeclining(false)} disabled={busy} className={BTN_GHOST}>
            {t.back}
          </button>
          <button
            type="button"
            onClick={() => respond({ decision: "DECLINE", note })}
            disabled={busy || note.trim().length === 0}
            className={BTN_PRIMARY}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send aria-hidden className="h-4 w-4 rtl:-scale-x-100" />} {t.send}
          </button>
        </div>
      )}
    </div>
  );
}

function Timeline({ project }: { project: SiteProjectDTO }) {
  const { t, dateTime } = useText();
  return (
    <details className={`${CARD} group`}>
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[var(--color-ink)] marker:content-none">
        <History aria-hidden className="h-5 w-5 text-[var(--color-ink-muted)]" />
        <span className="flex-1">{t.history}</span>
        <ChevronDown aria-hidden className="h-4 w-4 text-[var(--color-ink-faint)] transition-transform group-open:rotate-180" />
      </summary>
      <ol className="mt-3 space-y-3">
        {project.events.map((e) => (
          <li key={e.id} className="flex gap-3 text-sm">
            <CheckCircle2 aria-hidden className="mt-1 h-4 w-4 shrink-0 text-[var(--color-neon)]" />
            <div className="min-w-0">
              <p className="text-[var(--color-ink)]">{t.events[e.type]}</p>
              <p className="text-xs text-[var(--color-ink-faint)]">
                {e.actorLabel} · {dateTime(e.createdAt)}
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
  const { t, money } = useText();
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

  // Item names are the catalog's English ones everywhere, so the SKU never changes.
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
    if (r.name.trim() === "") return t.issueChooseItem;
    if (!(Number(r.quantity) > 0)) return t.issueQty;
    if (!(Number(r.unitPrice) > 0)) return t.issuePrice;
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
      setError(t.itemIssue(firstBad + 1, issues[firstBad] ?? ""));
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
      if (!res.ok || !data.project) return setError(data?.error ?? t.errSend);
      onSubmitted(data.project);
    } catch {
      setError(t.errNetwork);
    } finally {
      setBusy(false);
    }
  }

  const label = "mb-1 flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-muted)]";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink)]">
        <FileText aria-hidden className="h-5 w-5 text-[var(--color-amber-strong)]" /> {t.yourQuotation}
      </p>

      {rows.map((r, i) => {
        const issue = showIssues ? lineIssue(r) : null;
        return (
          <div
            key={r.key}
            id={`row-${r.key}`}
            className={`${CARD} scroll-mt-20 space-y-3 ${issue ? "!border-red-300" : ""}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--color-ink-muted)]">{t.item(i + 1)}</p>
              {rows.length > 1 && (
                <button
                  type="button"
                  aria-label={t.removeItem(i + 1)}
                  onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                  className="-me-2 flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-ink-faint)] transition hover:text-red-600"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              )}
            </div>
            <select
              aria-label={t.item(i + 1)}
              value={r.custom ? CUSTOM_VALUE : r.itemKey}
              onChange={(e) => pickItem(r.key, e.target.value)}
              className={INPUT}
            >
              <option value="">{t.chooseItem}</option>
              {catalog.flatMap((g) =>
                g.items.map((it) => (
                  <option key={`${g.group}::${it.code}`} value={`${g.group}::${it.code}`}>
                    {catalogEntryLabel(g, it)}
                  </option>
                )),
              )}
              <option value={CUSTOM_VALUE}>{t.otherOption}</option>
            </select>
            {r.custom && (
              <input
                aria-label={t.itemName}
                value={r.name}
                onChange={(e) => updateRow(r.key, { name: e.target.value })}
                placeholder={t.itemName}
                className={INPUT}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`qty-${r.key}`} className={label}>
                  <Hash aria-hidden className="h-4 w-4" /> {t.qty}
                </label>
                <input id={`qty-${r.key}`} inputMode="decimal" value={r.quantity} onChange={(e) => updateRow(r.key, { quantity: digitsOnly(e.target.value) })} className={INPUT} />
              </div>
              <div>
                <label htmlFor={`unit-${r.key}`} className={label}>
                  <Ruler aria-hidden className="h-4 w-4" /> {t.unit}
                </label>
                <input id={`unit-${r.key}`} list="unit-options" value={r.unit} onChange={(e) => updateRow(r.key, { unit: e.target.value })} className={INPUT} />
              </div>
              <div className="col-span-2">
                <label htmlFor={`price-${r.key}`} className={label}>
                  <Banknote aria-hidden className="h-4 w-4" /> {t.rsEach}
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
                  <span className="num font-semibold tabular-nums text-[var(--color-ink)]">
                    = {money(lineTotalPKR(Number(r.quantity), Number(r.unitPrice)))}
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

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            setRows((prev) => [...prev, emptyRow(nextKey)]);
            setNextKey((k) => k + 1);
          }}
          className={BTN_GHOST}
        >
          <Plus aria-hidden className="h-4 w-4" /> {t.addItem}
        </button>
        <button
          type="button"
          onClick={() => {
            setRows((prev) => [...prev, emptyRow(nextKey, true)]);
            setNextKey((k) => k + 1);
          }}
          className={BTN_GHOST}
        >
          <Pencil aria-hidden className="h-4 w-4" /> {t.addOther}
        </button>
      </div>

      <div className={CARD}>
        <label htmlFor="service-fee" className={label}>
          <Wrench aria-hidden className="h-4 w-4" /> {t.yourFeeRs}
        </label>
        <input id="service-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(digitsOnly(e.target.value))} className={INPUT} />
      </div>

      {/* Docked to the bottom of the screen while they fill in the lines, so the
          running total and the Send button are never a long scroll away. */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-white/95 pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl px-4">
          {error && (
            <p role="alert" className="mb-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-muted)]">
                <Banknote aria-hidden className="h-4 w-4" /> {t.total}
              </p>
              <p className="num text-xl font-bold tabular-nums text-[var(--color-ink)]">{money(total + (Number(fee) || 0))}</p>
            </div>
            <button type="submit" disabled={busy} className={`${BTN_PRIMARY} !w-auto shrink-0 px-6`}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send aria-hidden className="h-5 w-5 rtl:-scale-x-100" />}
              {project.status === "REVISION_REQUESTED" ? t.resubmit : t.send}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
