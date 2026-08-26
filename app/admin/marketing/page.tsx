"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Sparkles,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Info,
  Flame,
  Building2,
  Scissors,
  RefreshCw,
  Video,
  Megaphone as MegaphoneIcon,
} from "lucide-react";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";
import { getStoredToken } from "@/lib/internal/access";
import { generateContentPlan, type ContentPlan } from "@/actions/generate-content-plan";

// ============================================================================
// /admin/marketing — AI Marketing Hub (2026-08-26, Gemini + premium-UI pass).
//
// One primary action (generate this week's strategy: 2 TikTok scripts +
// 1 Meta ad, per the hardcoded brand/strategy context in
// actions/generate-content-plan.ts), rendered as 3 scannable cards, each
// individually copyable. The quick-feedback buttons below the results
// call the SAME server action again with a specific instruction and the
// current plan attached, so a "regeneration" REVISES what's on screen
// rather than starting over from nothing — see generateContentPlan's own
// doc comment.
//
// Deliberately its own visual register (soft gradient background,
// glassmorphic cards) rather than the plain stone/white shell every
// other /admin/* page uses — asked for explicitly, and this page has
// none of the storefront's scroll-jank concerns (see the same-session
// perf pass on app/HomePageContent.tsx's sticky header): it's a low-
// traffic admin page, not a scroll-heavy customer surface, so the extra
// backdrop-blur here doesn't carry the same cost.
// ============================================================================

const FEEDBACK_OPTIONS: { label: string; icon: typeof Flame; instruction: string }[] = [
  { label: "Make Hook Aggressive", icon: Flame, instruction: "Make both TikTok hooks noticeably more aggressive and attention-grabbing — sharper, more provocative, less safe." },
  { label: "Focus on Commercial", icon: Building2, instruction: "Re-angle everything toward commercial plaza owners specifically, not homeowners — their pain points (running costs, load-shedding downtime for a business) instead." },
  { label: "Make Script Shorter", icon: Scissors, instruction: "Cut both TikTok scripts down significantly — tighter, punchier, get to the CTA faster." },
];

/** Cycled while a generation is in flight — the "smooth streaming feel"
 *  without real token streaming (a Server Action can't naturally stream
 *  to the client the way an API route's ReadableStream can — see this
 *  page's own doc comment / actions/generate-content-plan.ts). */
const LOADING_PHRASES = [
  "Analyzing Lahore solar search trends...",
  "Drafting the LESCO-rate hook...",
  "Writing the engineering-trust script...",
  "Formatting the Meta ad copy...",
  "Checking against brand guardrails...",
];

export default function MarketingAdminPage() {
  const { onUnauthorized } = useAdminAuth();
  return <MarketingHub onUnauthorized={onUnauthorized} />;
}

function MarketingHub({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  /** Which specific action is in flight — the primary generate button vs
   *  one of the 3 feedback buttons — so only THAT control shows its own
   *  spinner instead of every button disabling with no visual distinction. */
  const [activeAction, setActiveAction] = useState<"generate" | string | null>(null);
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);

  useEffect(() => {
    if (!generating) return;
    const id = setInterval(() => setLoadingPhraseIndex((i) => (i + 1) % LOADING_PHRASES.length), 1400);
    return () => clearInterval(id);
  }, [generating]);

  async function runGeneration(feedback?: string, previousPlan?: ContentPlan) {
    const token = getStoredToken("ADMIN");
    if (!token) return onUnauthorized();

    setGenerating(true);
    setLoadingPhraseIndex(0);
    setError(null);
    setFallbackNotice(null);
    try {
      const result = await generateContentPlan({ token, feedback, previousPlan });
      if (!result.success) {
        if (result.error === "Unauthorized") return onUnauthorized();
        setError(result.error);
        return;
      }
      setPlan(result.plan);
      setFallbackNotice(result.fallback ? result.error : null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
      setActiveAction(null);
    }
  }

  function handleGenerate() {
    setActiveAction("generate");
    runGeneration();
  }

  function handleFeedback(instruction: string) {
    if (!plan) return;
    setActiveAction(instruction);
    runGeneration(instruction, plan);
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-stone-50 px-4 py-6 sm:px-8">
      {/* Soft ambient gradient wash — static, not animated, so it never
          competes with the loading/reveal animations below. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[420px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(139,92,246,0.14),transparent)]"
      />
      <div className="relative z-10 mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-violet-600">
              <ShieldCheck className="h-3.5 w-3.5" /> Solar Pixel · Admin
            </p>
            <h1 className="mt-0.5 bg-gradient-to-r from-stone-900 to-violet-700 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
              Marketing Hub
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              AI-drafted weekly TikTok/Reels scripts + Meta ad copy, on-brand and on-guardrail every time.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="group relative flex min-h-11 items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all duration-200 hover:shadow-violet-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating && activeAction === "generate" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
            )}
            {plan ? "Generate New Strategy" : "Generate Weekly Content Strategy"}
          </button>
        </header>

        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {fallbackNotice && !error && (
          <div className="mb-6 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{fallbackNotice}</p>
          </div>
        )}

        {!plan && !generating && !error && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-white/60 px-6 py-16 text-center backdrop-blur-sm">
            <Sparkles className="h-8 w-8 text-violet-300" />
            <p className="mt-3 text-sm font-medium text-stone-600">No strategy generated yet this session.</p>
            <p className="mt-1 max-w-sm text-xs text-stone-400">
              Click &ldquo;Generate Weekly Content Strategy&rdquo; — you&apos;ll get 2 TikTok scripts and 1 Meta ad,
              on-brand and ready to film or boost.
            </p>
          </div>
        )}

        {generating && activeAction === "generate" && !plan && (
          <>
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-violet-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="animate-fade-up" key={loadingPhraseIndex}>
                {LOADING_PHRASES[loadingPhraseIndex]}
              </span>
            </p>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </>
        )}

        {plan && (
          <>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <TikTokCard
                title="TikTok Script 1"
                subtitle="Viral Hook · LESCO Rates"
                accent="orange"
                script={plan.tiktokScript1}
                loading={generating}
              />
              <TikTokCard
                title="TikTok Script 2"
                subtitle="Trust & Engineering"
                accent="emerald"
                script={plan.tiktokScript2}
                loading={generating}
              />
              <MetaAdCard ad={plan.metaAd} loading={generating} />
            </div>

            <div className="mt-6 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-md">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Quick Regenerate</p>
              <div className="flex flex-wrap gap-2">
                {FEEDBACK_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => handleFeedback(opt.instruction)}
                    disabled={generating}
                    className="flex min-h-9 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 text-xs font-medium text-stone-600 transition-colors duration-200 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {generating && activeAction === opt.instruction ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <opt.icon className="h-3.5 w-3.5" />
                    )}
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex min-h-9 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 text-xs font-medium text-stone-600 transition-colors duration-200 hover:border-stone-300 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Start Fresh
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

// ============================================================================
// Cards
// ============================================================================

const ACCENT_CLASSES = {
  orange: { border: "border-orange-200/70", bg: "bg-orange-50", text: "text-orange-700", icon: "text-orange-500", top: "from-orange-400 to-amber-300" },
  emerald: { border: "border-emerald-200/70", bg: "bg-emerald-50", text: "text-emerald-700", icon: "text-emerald-500", top: "from-emerald-400 to-teal-300" },
  violet: { border: "border-violet-200/70", bg: "bg-violet-50", text: "text-violet-700", icon: "text-violet-500", top: "from-violet-500 to-fuchsia-400" },
} as const;

function CardShell({
  title,
  subtitle,
  icon: Icon,
  accent,
  loading,
  onCopy,
  copied,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof Video;
  accent: keyof typeof ACCENT_CLASSES;
  loading: boolean;
  onCopy: () => void;
  copied: boolean;
  children: React.ReactNode;
}) {
  const c = ACCENT_CLASSES[accent];
  return (
    <div
      className={`animate-fade-up relative flex flex-col overflow-hidden rounded-3xl border ${c.border} bg-white/70 p-5 shadow-lg shadow-stone-200/40 backdrop-blur-xl transition-opacity duration-300 ${loading ? "opacity-60" : ""}`}
    >
      <span aria-hidden className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.top}`} />
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${c.bg}`}>
            <Icon className={`h-4.5 w-4.5 ${c.icon}`} />
          </span>
          <div>
            <p className="text-sm font-bold text-stone-900">{title}</p>
            <p className={`text-[11px] font-medium ${c.text}`}>{subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 text-[11px] font-medium text-stone-500 transition-colors duration-200 hover:border-stone-300 hover:bg-stone-50"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex-1 space-y-3.5 text-sm">{children}</div>
    </div>
  );
}

function CardSection({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="whitespace-pre-line leading-relaxed text-stone-700">{text}</p>
    </div>
  );
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  function copy(text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  }
  return { copied, copy };
}

function TikTokCard({
  title,
  subtitle,
  accent,
  script,
  loading,
}: {
  title: string;
  subtitle: string;
  accent: keyof typeof ACCENT_CLASSES;
  script: ContentPlan["tiktokScript1"];
  loading: boolean;
}) {
  const { copied, copy } = useCopy();
  const fullText = `${title} — ${subtitle}\n\nHOOK (Roman Urdu):\n${script.hookRomanUrdu}\n\nVISUAL DIRECTIONS:\n${script.visualDirections}\n\nFULL SCRIPT:\n${script.fullScript}`;
  return (
    <CardShell title={title} subtitle={subtitle} icon={Video} accent={accent} loading={loading} onCopy={() => copy(fullText)} copied={copied}>
      <CardSection label="Hook (Roman Urdu)" text={script.hookRomanUrdu} />
      <CardSection label="Visual Directions" text={script.visualDirections} />
      <CardSection label="Full Script" text={script.fullScript} />
    </CardShell>
  );
}

function MetaAdCard({ ad, loading }: { ad: ContentPlan["metaAd"]; loading: boolean }) {
  const { copied, copy } = useCopy();
  const fullText = `Meta Ad Copy\n\nHeadline:\n${ad.headline}\n\nPrimary Text:\n${ad.primaryText}`;
  return (
    <CardShell title="Meta Ad Copy" subtitle="Boost / Retargeting" icon={MegaphoneIcon} accent="violet" loading={loading} onCopy={() => copy(fullText)} copied={copied}>
      <CardSection label="Headline" text={ad.headline} />
      <CardSection label="Primary Text" text={ad.primaryText} />
      <div className="mt-auto rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-[11px] text-violet-600">
        Max 30,000 PKR/mo (Rs 1,000/day) — boost the top-performing organic post, don&apos;t run this cold.
      </div>
    </CardShell>
  );
}

function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-5 shadow-lg shadow-stone-200/40 backdrop-blur-xl">
      {/* Shimmer sweep, not a flat pulse — reads as "actively working,"
          same intent as the loading-phrase text above it. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      <div className="mb-4 flex items-center gap-2.5">
        <span className="h-9 w-9 shrink-0 rounded-xl bg-stone-100" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-24 rounded bg-stone-100" />
          <div className="h-2.5 w-32 rounded bg-stone-100" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-2.5 w-full rounded bg-stone-100" />
        <div className="h-2.5 w-5/6 rounded bg-stone-100" />
        <div className="h-2.5 w-full rounded bg-stone-100" />
        <div className="h-2.5 w-2/3 rounded bg-stone-100" />
        <div className="h-2.5 w-full rounded bg-stone-100" />
        <div className="h-2.5 w-4/5 rounded bg-stone-100" />
      </div>
    </div>
  );
}
