"use client";

import { useState } from "react";
import { Sun, ArrowLeft, ArrowRight, Lock, CheckCircle2, CalendarCheck } from "lucide-react";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { PropertyTypeStep } from "@/components/wizard/steps/property-type";
import { EnergyUsageStep } from "@/components/wizard/steps/energy-usage";
import { ResultsStep } from "@/components/wizard/steps/results";
import { ContactStep } from "@/components/wizard/steps/contact";
import { PROPERTY_LABELS, type ConfigState } from "@/lib/wizard/solar";
import { cn } from "@/lib/utils/cn";

const STEP_META = [
  {
    eyebrow: "Step 1 of 4",
    title: "What are we powering?",
    subtitle: "Choose the property type so we can tailor your system.",
  },
  {
    eyebrow: "Step 2 of 4",
    title: "Tell us about your usage",
    subtitle: "Your bill helps us size the system precisely.",
  },
  {
    eyebrow: "Step 3 of 4",
    title: "Your solar estimate",
    subtitle: "Here is what going solar looks like for you.",
  },
  {
    eyebrow: "Step 4 of 4",
    title: "Lock in your price",
    subtitle: "Add your details to reserve this quote.",
  },
];

export function Configurator() {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [config, setConfig] = useState<ConfigState>({
    propertyType: null,
    monthlyBill: 0,
    panelTier: "standard",
    inverterTier: "hybrid",
  });
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  function patchConfig(patch: Partial<ConfigState>) {
    setConfig((prev) => ({ ...prev, ...patch }));
  }

  const canProceed =
    (step === 1 && config.propertyType !== null) ||
    (step === 2 && config.monthlyBill > 0) ||
    step === 3 ||
    (step === 4 && name.trim() !== "" && whatsapp.trim() !== "");

  const meta = STEP_META[step - 1];

  if (submitted) {
    return <SuccessScreen name={name} />;
  }

  return (
    <div className="w-full max-w-4xl">
      {/* Brand header */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-[1.225rem] bg-emerald-500 text-white">
            <Sun className="size-5" strokeWidth={2.25} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-800">Solar Pixel</span>
        </div>
        <span className="hidden rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-500 sm:block">
          Free instant estimate
        </span>
      </header>

      {/* Progress */}
      <div className="mb-8 rounded-[1.575rem] border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <StepIndicator current={step} />
      </div>

      {/* Main card */}
      <div className="rounded-[1.925rem] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.25)] sm:p-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">{meta.eyebrow}</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-800 text-balance sm:text-3xl">{meta.title}</h1>
          <p className="mt-1 text-sm text-slate-500 text-pretty">{meta.subtitle}</p>
        </div>

        <div className="min-h-[240px]">
          {step === 1 && <PropertyTypeStep value={config.propertyType} onSelect={(v) => patchConfig({ propertyType: v })} />}
          {step === 2 && <EnergyUsageStep value={config.monthlyBill} onChange={(v) => patchConfig({ monthlyBill: v })} />}
          {step === 3 && <ResultsStep config={config} onConfigChange={patchConfig} />}
          {step === 4 && (
            <ContactStep config={config} name={name} whatsapp={whatsapp} onNameChange={setName} onWhatsappChange={setWhatsapp} />
          )}
        </div>

        {/* Nav footer */}
        <div className="mt-8 flex items-center justify-between gap-4 border-t border-slate-200 pt-6">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-[1.225rem] px-4 text-sm font-medium transition-colors",
              step === 1 ? "pointer-events-none opacity-0" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            )}
          >
            <ArrowLeft className="size-4" />
            Back
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(4, s + 1))}
              disabled={!canProceed}
              className="inline-flex h-11 items-center gap-2 rounded-[1.225rem] bg-slate-800 px-6 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {step === 3 ? "Continue to booking" : "Continue"}
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSubmitted(true)}
              disabled={!canProceed}
              className={cn(
                "inline-flex h-12 items-center gap-2.5 rounded-[1.225rem] bg-amber-400 px-6 text-sm font-bold text-slate-800 transition-all disabled:cursor-not-allowed disabled:opacity-50",
                canProceed && "glow-amber hover:brightness-105"
              )}
            >
              <Lock className="size-4" strokeWidth={2.5} />
              Lock In Price &amp; Book Free Site Survey
            </button>
          )}
        </div>
      </div>

      {/* Context line */}
      {config.propertyType && (
        <p className="mt-5 text-center text-xs text-slate-500">
          {PROPERTY_LABELS[config.propertyType]} configuration
          {config.monthlyBill > 0 && ` · Rs ${config.monthlyBill.toLocaleString("en-PK")}/mo bill`}
        </p>
      )}
    </div>
  );
}

function SuccessScreen({ name }: { name: string }) {
  return (
    <div className="w-full max-w-lg text-center">
      <div className="rounded-[1.925rem] border border-slate-200 bg-white p-10 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.25)]">
        <span className="mx-auto flex size-16 items-center justify-center rounded-[1.575rem] bg-emerald-500 text-white">
          <CheckCircle2 className="size-8" strokeWidth={2} />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-800">
          Price locked{name ? `, ${name.split(" ")[0]}` : ""}!
        </h1>
        <p className="mt-2 text-sm text-slate-500 text-pretty">
          Your quote is reserved for 14 days. A Solar Pixel engineer will reach out on WhatsApp within 24 hours to
          schedule your free site survey.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 rounded-[1.225rem] bg-emerald-100/60 px-4 py-3 text-sm font-medium text-slate-800">
          <CalendarCheck className="size-5 text-emerald-500" />
          Site survey · confirmed within 24 hours
        </div>
      </div>
    </div>
  );
}
