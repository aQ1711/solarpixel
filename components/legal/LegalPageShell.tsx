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
          <div className="dot-grid border-b border-stone-200 bg-white">
            <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
              <p className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">
                <FileText className="h-3.5 w-3.5" /> Legal
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">{title}</h1>
              {updatedLabel && (
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-500">
                  <Clock className="h-3 w-3" /> {updatedLabel}
                </span>
              )}
            </div>
          </div>

          {toc && toc.length > 0 && (
            <div className="mx-auto max-w-3xl px-5 pt-8 sm:pt-10">
              <nav aria-label="Sections" className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-200/50">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">On this page</p>
                <ol className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {toc.map((item, i) => (
                    <li key={item.id}>
                      <Link
                        href={`#${item.id}`}
                        className="flex items-center gap-2 py-0.5 text-sm text-stone-600 transition-colors duration-200 hover:text-orange-700"
                      >
                        <span className="font-mono text-xs text-stone-400">{i + 1}.</span>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
          )}

          <article className="mx-auto max-w-3xl px-5 py-10 sm:py-12">
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
    <section id={id} className="scroll-mt-28 [&:not(:first-child)]:mt-10">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-700 text-sm font-bold text-white">
          {number}
        </span>
        <h2 className="text-lg font-bold tracking-tight text-stone-900">{title}</h2>
      </div>
      <div className="mt-3 pl-11">{children}</div>
    </section>
  );
}
