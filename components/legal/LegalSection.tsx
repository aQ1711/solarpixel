"use client";

import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

/**
 * One numbered section of a legal page. With a `summary` it is a native
 * <details> card: the title and a one-line summary show, the full legal
 * wording opens on tap (and stays in the page for search engines when
 * closed). Without one it is a plain open card, for sections that are a
 * single short sentence already.
 *
 * Client component only so a TOC link (#id) can open the section it lands
 * on; native <details> does not do that by itself.
 */
export function LegalSection({
  number,
  id,
  title,
  summary,
  children,
}: {
  number: number;
  id: string;
  title: string;
  summary?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!summary) return;
    const openIfTargeted = () => {
      if (window.location.hash === `#${id}` && ref.current) ref.current.open = true;
    };
    // next/link updates the hash with pushState, which fires no
    // `hashchange`, so a click on this section's own link is caught too.
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest("a");
      if (link?.getAttribute("href") !== `#${id}` || !ref.current) return;
      ref.current.open = true;
      requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", openIfTargeted);
      document.removeEventListener("click", onClick);
    };
  }, [id, summary]);

  const badge = (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1E3550] text-sm font-bold text-white">
      {number}
    </span>
  );
  const cardClass =
    "mt-3 scroll-mt-28 rounded-2xl border border-[#D5DFEC] bg-white shadow-sm shadow-[#1E3550]/5";

  if (!summary) {
    return (
      <section id={id} className={`${cardClass} p-4 sm:p-6`}>
        <div className="flex items-center gap-3">
          {badge}
          <h2 className="text-lg font-bold tracking-tight text-stone-900">{title}</h2>
        </div>
        <div className="mt-3 sm:pl-11">{children}</div>
      </section>
    );
  }

  return (
    <details ref={ref} id={id} data-legal-section className={`group ${cardClass} open:border-[#1E3550]/30`}>
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 marker:content-none sm:p-6">
        {badge}
        <span className="min-w-0 flex-1">
          <h2 className="text-lg font-bold tracking-tight text-stone-900">{title}</h2>
          <span className="mt-0.5 block text-sm leading-snug text-stone-500">{summary}</span>
        </span>
        <ChevronDown className="mt-1.5 h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="border-t border-[#E3EAF3] px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pl-[68px]">{children}</div>
    </details>
  );
}
