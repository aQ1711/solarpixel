import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Conditional className combinator, merging conflicting Tailwind
 *  utilities (e.g. two different `px-*` values) the way the last one
 *  wins, instead of both ending up in the class list. Used by the
 *  `/` wizard UI (components/wizard/**) — ported from the v0.dev
 *  design's own `lib/utils.ts`. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
