import Link from "next/link";
import { Clock, FileText } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * Shared shell for the three static trust/legal pages (About, Privacy
 * Policy, Terms of Service).
 *
 * 2026-09-05 ("header and footer should remain the same across the
 * application... don't you think so?" — yes): this used to render its
 * own separate, much plainer hand-rolled header/footer instead of the
 * real storefront ones — a genuine inconsistency, not a deliberate
 * design choice (a visitor clicking from the homepage to About Us saw a
 * completely different, thinner header and a bare "© Solar Pixel · 4
 * links" footer instead of the real Bang & Olufsen-style one). Now
 * renders the exact same SiteHeader/SiteFooter the homepage uses — see
 * those components' own doc comments. `variant` below governs the BODY
 * layout only; header/footer are identical either way.
 *
 * `variant`: "prose" (default) is Privacy/Terms — real legal text meant
 * to be read top to bottom, never fragmented into marketing-style cards.
 * "landing" hands `children` the bare body with NO wrapper at all, for a
 * page that builds its own full-width hero/section layout (see
 * app/about/page.tsx).
 *
 * 2026-09-05 ("legal pages update ux design with the current theme") —
 * "prose" gained a real intro band (eyebrow + icon + an actual "Updated"
 * pill instead of a plain gray caption) and, when `toc` is passed, a
 * jump-to-section card right under it — the same numbered-badge language
 * as the calculator's own STEP 1/2/3 headers (see LegalSection below),
 * so a 9-section Terms page reads as a navigable document instead of one
 * long scroll. The actual legal wording is untouched by any of this —
 * see app/terms/page.tsx and app/privacy-policy/page.tsx, only their
 * markup changed (numbers moved from inline heading text to a visual
 * badge, sections gained anchor ids for the TOC to link to).
 */
export function LegalPageShell({
  title,
  updatedLabel,
  children,
  variant = "prose",
  toc,
}: {
  title: string;
  updatedLabel?: string;
  children: React.ReactNode;
  variant?: "prose" | "landing";
  /** Section jump-links, rendered as a card right under the intro band.
   *  Only meaningful for variant="prose" — omit for a page with no real
   *  sections to jump between. */
  toc?: { id: string; label: string }[];
}) {
  return (
    <main className="min-h-dvh bg-stone-50">
      <SiteHeader />

      {variant === "landing" ? (
        children
      ) : (
        <>
          {/* Navy intro card, the same gradient + radius as the homepage's
              estimator card, so a legal page reads as part of the same
              product instead of a separate document template. */}
          <div className="px-3 pt-3 sm:px-5">
            <div className="relative mx-auto max-w-3xl overflow-hidden rounded-[22px] bg-gradient-to-b from-[#2F4D70] to-[#1E3550] px-5 py-8 shadow-[0_24px_50px_-26px_rgba(30,53,80,0.7)] sm:px-8 sm:py-12">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-orange-400/20 blur-3xl"
              />
              <p className="relative flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-300">
                <FileText className="h-3.5 w-3.5" /> Legal
              </p>
              <h1 className="relative mt-3 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
              {updatedLabel && (
                <span className="relative mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-[#C9D5E4]">
                  <Clock className="h-3 w-3" /> {updatedLabel}
                </span>
              )}
            </div>
          </div>

          {toc && toc.length > 0 && (
            <div className="mx-auto max-w-3xl px-3 pt-3 sm:px-5">
              <nav aria-label="Sections" className="rounded-2xl border border-[#D5DFEC] bg-[#EDF2F8] p-4 sm:p-5">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5A6472]">On this page</p>
                <ol className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {toc.map((item, i) => (
                    <li key={item.id}>
                      <Link
                        href={`#${item.id}`}
                        className="flex min-h-9 items-center gap-2.5 text-sm font-medium text-[#1E3550] transition-colors duration-200 hover:text-orange-700"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1E3550]/10 font-mono text-[11px] font-semibold text-[#1E3550]">
                          {i + 1}
                        </span>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
          )}

          <article className="mx-auto max-w-3xl px-3 pb-10 pt-4 sm:px-5 sm:pb-12">
            <div className="legal-prose">{children}</div>
          </article>
        </>
      )}

      <SiteFooter />
    </main>
  );
}

/**
 * One numbered section within a "prose" legal page (2026-09-05) — same
 * orange circular-badge + title language as the calculator's own STEP
 * 1/2/3 headers (StepHeader in app/HomePageContent.tsx), so a legal page
 * reads as the same product instead of a plain word-processor export.
 * `number` is a visual badge only, not part of the heading text anymore
 * — Terms' old headings were literally "1. Instant Quotations Are
 * Estimates" as one string; splitting the number out here changes only
 * how it renders, not the wording. `id` is what LegalPageShell's `toc`
 * links jump to; `scroll-mt-28` keeps the sticky-adjacent heading clear
 * of the fixed header on landing from a TOC link.
 */
export function LegalSection({
  number,
  id,
  title,
  children,
}: {
  number: number;
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="mt-3 scroll-mt-28 rounded-2xl border border-[#D5DFEC] bg-white p-4 shadow-sm shadow-[#1E3550]/5 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1E3550] text-sm font-bold text-white">
          {number}
        </span>
        <h2 className="text-lg font-bold tracking-tight text-stone-900">{title}</h2>
      </div>
      <div className="mt-3 sm:pl-11">{children}</div>
    </section>
  );
}
