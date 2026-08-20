"use client";

import { useState } from "react";
import { Gauge, Wallet, TrendingDown, CalendarClock, ChevronDown, Sliders, Leaf, Check } from "lucide-react";
import {
  calculateQuote,
  formatPKR,
  PANEL_LABELS,
  INVERTER_LABELS,
  type ConfigState,
  type PanelTier,
  type InverterTier,
} from "@/lib/wizard/solar";
import { cn } from "@/lib/utils/cn";

const PANEL_TIERS: { id: PanelTier; note: string }[] = [
  { id: "value", note: "Best price · 25-yr warranty" },
  { id: "standard", note: "Higher yield · N-Type cells" },
  { id: "premium", note: "Top efficiency · lowest degradation" },
];

const INVERTER_TIERS: { id: InverterTier; note: string }[] = [
  { id: "string", note: "Reliable grid-tie" },
  { id: "hybrid", note: "Battery-ready backup" },
  { id: "premium", note: "Smart monitoring · highest MPPT" },
];

export function ResultsStep({
  config,
  onConfigChange,
}: {
  config: ConfigState;
  onConfigChange: (patch: Partial<ConfigState>) => void;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const quote = calculateQuote(config);

  const metrics = [
    {
      icon: Gauge,
      label: "Recommended System",
      value: `${quote.systemSizeKw} kW`,
      sub: `${quote.panelCount} panels`,
      highlight: true,
    },
    {
      icon: Wallet,
      label: "Turnkey Cost",
      value: formatPKR(quote.turnkeyCost),
      sub: "Fully installed",
    },
    {
      icon: TrendingDown,
      label: "Monthly Savings",
      value: formatPKR(quote.monthlySavings),
      sub: `${formatPKR(quote.annualSavings)}/yr`,
    },
    {
      icon: CalendarClock,
      label: "Payback Period",
      value: `${quote.paybackYears.toFixed(1)} yrs`,
      sub: "Then free power",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.label}
              className={cn(
                "rounded-[1.575rem] border p-5 transition-shadow",
                m.highlight ? "border-emerald-500/30 bg-emerald-100/50" : "border-slate-200 bg-white"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-[0.875rem]",
                    m.highlight ? "bg-emerald-500 text-white" : "bg-slate-100 text-emerald-500"
                  )}
                >
                  <Icon className="size-5" strokeWidth={2} />
                </span>
              </div>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">{m.label}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-800 tabular-nums">{m.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{m.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Green impact strip */}
      <div className="flex items-center gap-3 rounded-[1.575rem] border border-emerald-500/25 bg-emerald-100/40 px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-[0.875rem] bg-emerald-500 text-white">
          <Leaf className="size-5" />
        </span>
        <p className="text-sm text-slate-800/80">
          Offsets <span className="font-semibold text-slate-800">{quote.co2OffsetTons.toFixed(1)} tons of CO2</span> every
          year — equivalent to planting{" "}
          <span className="font-semibold text-slate-800">{Math.round(quote.co2OffsetTons * 45)} trees</span>.
        </p>
      </div>

      {/* Itemized breakdown drawer */}
      <div className="overflow-hidden rounded-[1.575rem] border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          aria-expanded={showBreakdown}
          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-slate-100/50"
        >
          <span className="text-sm font-semibold text-slate-800">Itemized Cost Breakdown</span>
          <ChevronDown className={cn("size-4 text-slate-500 transition-transform duration-300", showBreakdown && "rotate-180")} />
        </button>

        <div
          className={cn(
            "grid transition-all duration-300 ease-out",
            showBreakdown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden">
            <div className="border-t border-slate-200 px-5 py-2">
              {quote.lineItems.map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-4 border-b border-slate-200/60 py-3.5 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.detail}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-slate-800 tabular-nums">{formatPKR(item.amount)}</p>
                </div>
              ))}
              <div className="flex items-center justify-between py-4">
                <p className="text-sm font-semibold text-slate-800">Total turnkey price</p>
                <p className="text-base font-bold text-emerald-500 tabular-nums">{formatPKR(quote.turnkeyCost)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customize panels & inverters */}
      <div className="overflow-hidden rounded-[1.575rem] border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setShowCustomize((v) => !v)}
          aria-expanded={showCustomize}
          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-slate-100/50"
        >
          <span className="flex items-center gap-2.5 text-sm font-semibold text-slate-800">
            <Sliders className="size-4 text-emerald-500" />
            Customize Panels &amp; Inverters
          </span>
          <ChevronDown className={cn("size-4 text-slate-500 transition-transform duration-300", showCustomize && "rotate-180")} />
        </button>

        <div
          className={cn(
            "grid transition-all duration-300 ease-out",
            showCustomize ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-6 border-t border-slate-200 px-5 py-5">
              <TierGroup
                title="Solar Panels"
                options={PANEL_TIERS.map((t) => ({ id: t.id, label: PANEL_LABELS[t.id], note: t.note }))}
                selected={config.panelTier}
                onSelect={(id) => onConfigChange({ panelTier: id as PanelTier })}
              />
              <TierGroup
                title="Inverter"
                options={INVERTER_TIERS.map((t) => ({ id: t.id, label: INVERTER_LABELS[t.id], note: t.note }))}
                selected={config.inverterTier}
                onSelect={(id) => onConfigChange({ inverterTier: id as InverterTier })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TierGroup({
  title,
  options,
  selected,
  onSelect,
}: {
  title: string;
  options: { id: string; label: string; note: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {options.map((opt) => {
          const active = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              aria-pressed={active}
              className={cn(
                "flex flex-col gap-1 rounded-[1.225rem] border p-3.5 text-left transition-all",
                active ? "border-emerald-500 bg-emerald-100/50 ring-1 ring-emerald-500/25" : "border-slate-200 bg-white hover:border-emerald-500/40"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium leading-tight text-slate-800">{opt.label}</span>
                {active && <Check className="size-4 shrink-0 text-emerald-500" strokeWidth={3} />}
              </span>
              <span className="text-xs text-slate-500">{opt.note}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
