"use client";

import { Home, Building2, Factory, ArrowRight, Check } from "lucide-react";
import type { PropertyType } from "@/lib/wizard/solar";
import { cn } from "@/lib/utils/cn";

const OPTIONS: {
  id: PropertyType;
  title: string;
  blurb: string;
  range: string;
  icon: typeof Home;
}[] = [
  {
    id: "residential",
    title: "Residential",
    blurb: "Homes, villas & apartments",
    range: "3 – 15 kW",
    icon: Home,
  },
  {
    id: "commercial",
    title: "Commercial",
    blurb: "Offices, shops & clinics",
    range: "15 – 100 kW",
    icon: Building2,
  },
  {
    id: "industrial",
    title: "Industrial",
    blurb: "Factories & warehouses",
    range: "100 kW – 1 MW+",
    icon: Factory,
  },
];

export function PropertyTypeStep({
  value,
  onSelect,
}: {
  value: PropertyType | null;
  onSelect: (v: PropertyType) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            aria-pressed={selected}
            className={cn(
              "group relative flex flex-col items-start gap-5 rounded-[1.575rem] border bg-white p-6 text-left transition-all duration-200",
              "hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_rgba(15,23,42,0.18)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20",
              selected
                ? "border-emerald-500 shadow-[0_16px_40px_-16px_rgba(16,185,129,0.35)] ring-2 ring-emerald-500/25"
                : "border-slate-200"
            )}
          >
            <span
              className={cn(
                "absolute right-4 top-4 flex size-6 items-center justify-center rounded-full border transition-all",
                selected ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-200 bg-slate-100 text-transparent"
              )}
            >
              <Check className="size-3.5" strokeWidth={3} />
            </span>

            <span
              className={cn(
                "flex size-14 items-center justify-center rounded-[1.225rem] transition-colors",
                selected ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-500"
              )}
            >
              <Icon className="size-7" strokeWidth={1.75} />
            </span>

            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-800">{opt.title}</h3>
              <p className="text-sm text-slate-500">{opt.blurb}</p>
            </div>

            <div className="mt-auto flex w-full items-center justify-between border-t border-slate-200/70 pt-4">
              <div>
                <p className="text-[0.7rem] font-medium uppercase tracking-wide text-slate-500">Typical size</p>
                <p className="text-sm font-semibold text-slate-800">{opt.range}</p>
              </div>
              <ArrowRight
                className={cn(
                  "size-4 transition-transform group-hover:translate-x-0.5",
                  selected ? "text-emerald-500" : "text-slate-500"
                )}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
