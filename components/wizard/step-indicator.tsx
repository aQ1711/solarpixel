import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const STEPS = [
  { id: 1, label: "Property" },
  { id: 2, label: "Usage" },
  { id: 3, label: "Estimate" },
  { id: 4, label: "Book Survey" },
];

export function StepIndicator({ current }: { current: number }) {
  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="flex items-center">
        {STEPS.map((step, index) => {
          const isComplete = current > step.id;
          const isActive = current === step.id;
          const isLast = index === STEPS.length - 1;

          return (
            <li key={step.id} className={cn("flex items-center", !isLast && "flex-1")}>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border text-sm font-semibold transition-all duration-300",
                    isComplete && "border-emerald-500 bg-emerald-500 text-white",
                    isActive && "border-emerald-500 bg-emerald-100 text-emerald-500 ring-4 ring-emerald-500/15",
                    !isComplete && !isActive && "border-slate-200 bg-white text-slate-500"
                  )}
                >
                  {isComplete ? <Check className="size-4" strokeWidth={3} /> : step.id}
                </span>
                <span
                  className={cn(
                    "hidden text-sm font-medium transition-colors sm:block",
                    isActive || isComplete ? "text-slate-800" : "text-slate-500"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {!isLast && (
                <div className="mx-3 h-px flex-1 overflow-hidden rounded-full bg-slate-200 sm:mx-4">
                  <div
                    className={cn(
                      "h-full bg-emerald-500 transition-all duration-500 ease-out",
                      isComplete ? "w-full" : "w-0"
                    )}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
