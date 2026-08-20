"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileText, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatPKR } from "@/lib/wizard/solar";

const PRESETS = [25_000, 50_000, 100_000, 250_000];

export function EnergyUsageStep({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (files && files[0]) setFileName(files[0].name);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      {/* Bill input */}
      <div className="space-y-4">
        <label htmlFor="monthly-bill" className="block text-sm font-medium text-slate-800">
          Average Monthly Bill <span className="text-slate-500">(PKR)</span>
        </label>

        <div className="relative">
          <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-lg font-semibold text-slate-500">
            Rs
          </span>
          <input
            id="monthly-bill"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="50,000"
            value={value === 0 ? "" : value}
            onChange={(e) => onChange(Number(e.target.value) || 0)}
            className="h-16 w-full rounded-[1.575rem] border border-slate-200 bg-white pl-14 pr-5 text-2xl font-semibold text-slate-800 tabular-nums shadow-sm transition-all outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                value === preset
                  ? "border-emerald-500 bg-emerald-100 text-emerald-500"
                  : "border-slate-200 bg-white text-slate-500 hover:border-emerald-500/40 hover:text-slate-800"
              )}
            >
              {formatPKR(preset)}
            </button>
          ))}
        </div>

        <div className="flex items-start gap-3 rounded-[1.225rem] bg-emerald-100/60 p-4">
          <Zap className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          <p className="text-sm text-slate-800/80">
            We use your bill to estimate consumption and size a system that offsets most of your usage under net
            metering.
          </p>
        </div>
      </div>

      {/* Dropzone */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-800">
          Upload your bill <span className="text-slate-500">(optional)</span>
        </p>

        {fileName ? (
          <div className="flex items-center gap-3 rounded-[1.575rem] border border-emerald-500/40 bg-emerald-100/50 p-5">
            <span className="flex size-11 items-center justify-center rounded-[1.225rem] bg-white text-emerald-500 shadow-sm">
              <FileText className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{fileName}</p>
              <p className="text-xs text-slate-500">Attached to your quote</p>
            </div>
            <button
              type="button"
              onClick={() => setFileName(null)}
              aria-label="Remove file"
              className="flex size-8 items-center justify-center rounded-[0.875rem] text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex min-h-[188px] w-full flex-col items-center justify-center gap-3 rounded-[1.575rem] border-2 border-dashed p-6 text-center transition-colors",
              dragging
                ? "border-emerald-500 bg-emerald-100/50"
                : "border-slate-200 bg-white hover:border-emerald-500/50 hover:bg-slate-100/50"
            )}
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-500">
              <UploadCloud className="size-6" />
            </span>
            <span className="text-sm font-medium text-slate-800">
              Drop your bill here or <span className="text-emerald-500">browse</span>
            </span>
            <span className="text-xs text-slate-500">PDF, JPG or PNG · up to 10 MB</span>
          </button>
        )}

        <input ref={inputRef} type="file" accept=".pdf,image/*" className="sr-only" onChange={(e) => handleFiles(e.target.files)} />
      </div>
    </div>
  );
}
