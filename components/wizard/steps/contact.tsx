"use client";

import { User, Phone, ShieldCheck } from "lucide-react";
import { calculateQuote, formatPKR, type ConfigState } from "@/lib/wizard/solar";

export function ContactStep({
  config,
  name,
  whatsapp,
  onNameChange,
  onWhatsappChange,
}: {
  config: ConfigState;
  name: string;
  whatsapp: string;
  onNameChange: (v: string) => void;
  onWhatsappChange: (v: string) => void;
}) {
  const quote = calculateQuote(config);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_0.85fr]">
      <div className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="name" className="block text-sm font-medium text-slate-800">
            Full Name
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
            <input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="e.g. Ayesha Khan"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="h-14 w-full rounded-[1.225rem] border border-slate-200 bg-white pl-11 pr-4 text-base text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="whatsapp" className="block text-sm font-medium text-slate-800">
            WhatsApp Number
          </label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
            <input
              id="whatsapp"
              type="tel"
              autoComplete="tel"
              placeholder="+92 3XX XXXXXXX"
              value={whatsapp}
              onChange={(e) => onWhatsappChange(e.target.value)}
              className="h-14 w-full rounded-[1.225rem] border border-slate-200 bg-white pl-11 pr-4 text-base text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
            />
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-[1.225rem] bg-slate-100/70 p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" />
          <p className="text-sm text-slate-500">
            Your price is locked for <span className="font-medium text-slate-800">14 days</span>. A Solar Pixel engineer
            will confirm your free site survey on WhatsApp.
          </p>
        </div>
      </div>

      {/* Quote summary card */}
      <div className="rounded-[1.575rem] border border-slate-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your locked quote</p>
        <div className="mt-4 space-y-3.5">
          <SummaryRow label="System size" value={`${quote.systemSizeKw} kW`} />
          <SummaryRow label="Turnkey cost" value={formatPKR(quote.turnkeyCost)} />
          <SummaryRow label="Monthly savings" value={formatPKR(quote.monthlySavings)} accent />
          <SummaryRow label="Payback" value={`${quote.paybackYears.toFixed(1)} yrs`} />
        </div>
        <div className="mt-5 rounded-[1.225rem] bg-emerald-100/60 px-4 py-3 text-center">
          <p className="text-xs text-slate-500">Estimated 25-year net benefit</p>
          <p className="text-lg font-bold text-emerald-500 tabular-nums">
            {formatPKR(quote.annualSavings * 25 - quote.turnkeyCost)}
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200/60 pb-3.5 last:border-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={accent ? "text-sm font-bold text-emerald-500 tabular-nums" : "text-sm font-semibold text-slate-800 tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
