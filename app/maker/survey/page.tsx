"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Search,
  Loader2,
  CheckCircle2,
  Camera,
  Home,
  Factory,
  Mountain,
  Ruler,
  User as UserIcon,
  BatteryCharging,
} from "lucide-react";
import { AccessGate } from "@/components/internal/AccessGate";
import { internalFetch } from "@/lib/internal/access";

// ============================================================================
// Types
// ============================================================================

type RoofType = "RCC_CONCRETE" | "CORRUGATED_METALLIC" | "GROUND_MOUNT";
type StructureChoice = "STANDARD_L1_L2" | "CUSTOM_ELEVATED";

interface QuoteSummary {
  id: string;
  quoteNumber: string;
  sector: string;
  serviceType: string;
  systemKw: number;
  status: string;
  leadName: string;
  leadCity: string;
  /** Pre-survey web estimate — null for ONGRID_ZERO_EXPORT quotes. */
  estimatedBatteryCapacityKwh: number | null;
}

interface Engineer {
  id: string;
  name: string;
}

const ROOF_TYPES: { value: RoofType; label: string; icon: typeof Home }[] = [
  { value: "RCC_CONCRETE", label: "RCC Concrete", icon: Home },
  { value: "CORRUGATED_METALLIC", label: "Corrugated Metallic", icon: Factory },
  { value: "GROUND_MOUNT", label: "Ground Mount", icon: Mountain },
];

const STRUCTURE_CHOICES: { value: StructureChoice; label: string; hint: string }[] = [
  { value: "STANDARD_L1_L2", label: "Standard L1/L2", hint: "Typical rooftop, no obstructions" },
  { value: "CUSTOM_ELEVATED", label: "Custom Elevated", hint: "Shading, uneven roof, or tall structure needed" },
];

// ============================================================================
// Page
// ============================================================================

export default function MakerSurveyPage() {
  return (
    <AccessGate role="MAKER" title="Field Engineer Access">
      {({ onUnauthorized }) => <MakerSurveyApp onUnauthorized={onUnauthorized} />}
    </AccessGate>
  );
}

function MakerSurveyApp({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [engineersError, setEngineersError] = useState<string | null>(null);

  useEffect(() => {
    internalFetch("MAKER", "/api/maker/engineers")
      .then(async (res) => {
        if (res.status === 401) return onUnauthorized();
        const data = await res.json();
        if (!res.ok) {
          setEngineersError(data?.error ?? "Could not load engineer list.");
          return;
        }
        setEngineers(data.engineers ?? []);
      })
      .catch(() => setEngineersError("Network error loading engineer list."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ colorScheme: "dark" }} className="min-h-dvh bg-[var(--color-bg)] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-md">
        <header className="mb-5">
          <p className="text-xs font-medium text-[var(--color-neon)]">Solar Pixel · Maker</p>
          <h1 className="mt-0.5 text-xl font-bold text-[var(--color-ink)]">Site Survey</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Load a quote, take exact measurements on-site, submit for Checker approval.
          </p>
        </header>

        {engineersError && (
          <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {engineersError}
          </p>
        )}

        <QuoteLookupAndSurvey engineers={engineers} onUnauthorized={onUnauthorized} />
      </div>
    </main>
  );
}

// ============================================================================
// Quote lookup + survey form
// ============================================================================

function QuoteLookupAndSurvey({
  engineers,
  onUnauthorized,
}: {
  engineers: Engineer[];
  onUnauthorized: () => void;
}) {
  const [quoteIdInput, setQuoteIdInput] = useState("");
  const [quote, setQuote] = useState<QuoteSummary | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    const id = quoteIdInput.trim();
    if (!id) return;

    setLookupLoading(true);
    setLookupError(null);
    setQuote(null);

    try {
      const res = await internalFetch("MAKER", `/api/maker/quotes/${encodeURIComponent(id)}`);
      if (res.status === 401) return onUnauthorized();
      const data = await res.json();
      if (!res.ok) {
        setLookupError(data?.error ?? "Could not load that quote.");
        return;
      }
      setQuote(data.quote);
    } catch {
      setLookupError("Network error. Please check your connection and try again.");
    } finally {
      setLookupLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="animate-fade-up rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-neon)]/10">
          <CheckCircle2 className="h-6 w-6 text-[var(--color-neon)]" />
        </div>
        <h2 className="mt-3 text-lg font-semibold text-[var(--color-ink)]">Survey Submitted</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Quote moved to <span className="text-[var(--color-amber)]">MAKER_SUBMITTED</span>. The Checker will
          review it next.
        </p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setQuote(null);
            setQuoteIdInput("");
          }}
          className="mt-4 w-full rounded-xl bg-[var(--color-amber)] py-3 text-sm font-semibold text-[var(--color-amber-ink)] transition hover:bg-[var(--color-amber-strong)]"
        >
          Survey Another Site
        </button>
      </div>
    );
  }

  if (!quote) {
    return (
      <form
        onSubmit={handleLookup}
        className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
      >
        <label htmlFor="quoteId" className="mb-1.5 block text-sm font-medium text-[var(--color-ink-muted)]">
          Quote ID
        </label>
        <div className="flex gap-2">
          <input
            id="quoteId"
            type="text"
            value={quoteIdInput}
            onChange={(e) => setQuoteIdInput(e.target.value)}
            placeholder="e.g. cljk3x9f10000abcd"
            className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-amber)] focus:ring-2 focus:ring-[var(--color-amber)]/25"
          />
          <button
            type="submit"
            disabled={lookupLoading}
            className="flex items-center justify-center rounded-xl bg-[var(--color-amber)] px-4 text-[var(--color-amber-ink)] transition hover:bg-[var(--color-amber-strong)] disabled:opacity-70"
          >
            {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </button>
        </div>
        {lookupError && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {lookupError}
          </p>
        )}
        <p className="mt-3 text-[11px] text-[var(--color-ink-faint)]">
          Ask the office for the Quote ID before heading to site.
        </p>
      </form>
    );
  }

  return <SurveyForm quote={quote} engineers={engineers} onUnauthorized={onUnauthorized} onSubmitted={() => setSubmitted(true)} />;
}

// ============================================================================
// Survey form
// ============================================================================

function SurveyForm({
  quote,
  engineers,
  onUnauthorized,
  onSubmitted,
}: {
  quote: QuoteSummary;
  engineers: Engineer[];
  onUnauthorized: () => void;
  onSubmitted: () => void;
}) {
  const [engineerId, setEngineerId] = useState("");
  const [roofType, setRoofType] = useState<RoofType>("RCC_CONCRETE");
  const [structureChoice, setStructureChoice] = useState<StructureChoice>("STANDARD_L1_L2");
  const [dcCableMeters, setDcCableMeters] = useState("");
  const [acCableMeters, setAcCableMeters] = useState("");
  const [dataCableMeters, setDataCableMeters] = useState("");
  const [requiresDbUpgrade, setRequiresDbUpgrade] = useState(false);
  // Pre-filled from the original web estimate, overwritable on-site — a
  // fresh SurveyForm mounts per quote (see QuoteLookupAndSurvey), so this
  // initializer never goes stale across different quotes.
  const hasBattery = quote.serviceType === "HYBRID_BATTERY";
  const [surveyedBatteryCapacityKwh, setSurveyedBatteryCapacityKwh] = useState(
    quote.estimatedBatteryCapacityKwh != null ? String(quote.estimatedBatteryCapacityKwh) : ""
  );
  const [notes, setNotes] = useState("");
  const [photoDbBox, setPhotoDbBox] = useState<File | null>(null);
  const [photoRoof, setPhotoRoof] = useState<File | null>(null);
  const [photoMeter, setPhotoMeter] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!engineerId) {
      setSubmitError("Select which engineer conducted this survey.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const fd = new FormData();
    fd.set("quoteId", quote.id);
    fd.set("engineerId", engineerId);
    fd.set("roofType", roofType);
    fd.set("structureChoice", structureChoice);
    fd.set("dcCableMeters", dcCableMeters);
    fd.set("acCableMeters", acCableMeters);
    fd.set("dataCableMeters", dataCableMeters);
    fd.set("requiresDbUpgrade", String(requiresDbUpgrade));
    if (hasBattery && surveyedBatteryCapacityKwh.trim()) {
      fd.set("surveyedBatteryCapacityKwh", surveyedBatteryCapacityKwh);
    }
    fd.set("engineerNotes", notes);
    if (photoDbBox) fd.set("photoDbBox", photoDbBox);
    if (photoRoof) fd.set("photoRoof", photoRoof);
    if (photoMeter) fd.set("photoMeter", photoMeter);

    try {
      const res = await internalFetch("MAKER", "/api/maker/survey", { method: "POST", body: fd });
      if (res.status === 401) return onUnauthorized();
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      onSubmitted();
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Loaded quote summary */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-xs text-[var(--color-ink-faint)]">Quote #{quote.quoteNumber}</p>
        <p className="mt-0.5 text-base font-semibold text-[var(--color-ink)]">{quote.leadName}</p>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {quote.leadCity} · {quote.sector} · {quote.systemKw} kW estimate
        </p>
      </div>

      {/* Engineer */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <label htmlFor="engineerId" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-muted)]">
          <UserIcon className="h-4 w-4" /> Surveyed By
        </label>
        <select
          id="engineerId"
          required
          value={engineerId}
          onChange={(e) => setEngineerId(e.target.value)}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-amber)] focus:ring-2 focus:ring-[var(--color-amber)]/25"
        >
          <option value="">Select engineer…</option>
          {engineers.map((eng) => (
            <option key={eng.id} value={eng.id}>
              {eng.name}
            </option>
          ))}
        </select>
      </div>

      {/* Roof type */}
      <fieldset className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <legend className="mb-2 px-1 text-sm font-medium text-[var(--color-ink-muted)]">Roof Type</legend>
        <div className="grid grid-cols-3 gap-2">
          {ROOF_TYPES.map(({ value, label, icon: Icon }) => {
            const active = roofType === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setRoofType(value)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] font-medium leading-tight transition ${
                  active
                    ? "border-[var(--color-amber)] bg-[var(--color-amber)]/10 text-[var(--color-amber)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Structure choice */}
      <fieldset className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <legend className="mb-2 px-1 text-sm font-medium text-[var(--color-ink-muted)]">Structure Choice</legend>
        <div className="grid grid-cols-1 gap-2">
          {STRUCTURE_CHOICES.map(({ value, label, hint }) => {
            const active = structureChoice === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setStructureChoice(value)}
                aria-pressed={active}
                className={`rounded-xl border px-3.5 py-2.5 text-left transition ${
                  active
                    ? "border-[var(--color-amber)] bg-[var(--color-amber)]/10"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                }`}
              >
                <span className={`block text-sm font-medium ${active ? "text-[var(--color-amber)]" : "text-[var(--color-ink)]"}`}>
                  {label}
                </span>
                <span className="block text-xs text-[var(--color-ink-faint)]">{hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Cable meters */}
      <fieldset className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <legend className="mb-2 flex items-center gap-1.5 px-1 text-sm font-medium text-[var(--color-ink-muted)]">
          <Ruler className="h-4 w-4" /> Measured Cable Lengths (meters)
        </legend>
        <div className="space-y-3">
          <NumberField label="DC Cable" value={dcCableMeters} onChange={setDcCableMeters} />
          <NumberField label="AC Cable" value={acCableMeters} onChange={setAcCableMeters} />
          <NumberField label="Data Cable (CT Coil / Smart Meter)" value={dataCableMeters} onChange={setDataCableMeters} />
        </div>
      </fieldset>

      {/* Client requested battery capacity (HYBRID_BATTERY only) */}
      {hasBattery && (
        <fieldset className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <legend className="mb-2 flex items-center gap-1.5 px-1 text-sm font-medium text-[var(--color-ink-muted)]">
            <BatteryCharging className="h-4 w-4" /> Client Requested Battery Capacity (kWh)
          </legend>
          <NumberField
            label="Battery Capacity"
            value={surveyedBatteryCapacityKwh}
            onChange={setSurveyedBatteryCapacityKwh}
          />
          <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">
            Pre-filled with the web estimate. Overwrite it if the customer wants a different capacity.
          </p>
        </fieldset>
      )}

      {/* DB upgrade toggle */}
      <fieldset className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <legend className="mb-2 px-1 text-sm font-medium text-[var(--color-ink-muted)]">Requires DB Upgrade?</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: true, label: "Yes" },
            { value: false, label: "No" },
          ].map(({ value, label }) => {
            const active = requiresDbUpgrade === value;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setRequiresDbUpgrade(value)}
                aria-pressed={active}
                className={`rounded-xl border py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-[var(--color-amber)] bg-[var(--color-amber)]/10 text-[var(--color-amber)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Photos */}
      <fieldset className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <legend className="mb-2 flex items-center gap-1.5 px-1 text-sm font-medium text-[var(--color-ink-muted)]">
          <Camera className="h-4 w-4" /> Photos
        </legend>
        <div className="grid grid-cols-3 gap-2">
          <PhotoField label="DB Box" file={photoDbBox} onChange={setPhotoDbBox} />
          <PhotoField label="Roof" file={photoRoof} onChange={setPhotoRoof} />
          <PhotoField label="Meter" file={photoMeter} onChange={setPhotoMeter} />
        </div>
      </fieldset>

      {/* Notes */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-[var(--color-ink-muted)]">
          Field Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Access constraints, shading, customer preferences…"
          className="w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] outline-none transition focus:border-[var(--color-amber)] focus:ring-2 focus:ring-[var(--color-amber)]/25"
        />
      </div>

      {submitError && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="glow-cta flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-amber)] py-3.5 text-sm font-semibold text-[var(--color-amber-ink)] transition hover:bg-[var(--color-amber-strong)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
          </>
        ) : (
          "Submit Survey"
        )}
      </button>
    </form>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[var(--color-ink-faint)]">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.1"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-amber)] focus:ring-2 focus:ring-[var(--color-amber)]/25"
      />
    </div>
  );
}

function PhotoField({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const inputId = `photo-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label
      htmlFor={inputId}
      className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-3 text-center transition hover:border-[var(--color-amber)]"
    >
      <Camera className={`h-5 w-5 ${file ? "text-[var(--color-neon)]" : "text-[var(--color-ink-faint)]"}`} />
      <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">{label}</span>
      <span className="text-[10px] text-[var(--color-ink-faint)]">{file ? "Captured ✓" : "Tap to add"}</span>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}
