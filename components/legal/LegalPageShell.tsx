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
 * `variant` (2026-09-04, About page redesign — "market leading
 * international level design"): "prose" (default, unchanged) renders
 * the plain narrow article — right for Privacy/Terms, real legal text
 * meant to be read top to bottom. "landing" hands `children` the bare
 * body with NO h1/article/prose wrapper, so a page can build its own
 * full-width hero/section layout (see app/about/page.tsx) instead of
 * being forced into a single prose column.
 */
export function LegalPageShell({
  title,
  updatedLabel,
  children,
  variant = "prose",
}: {
  title: string;
  updatedLabel?: string;
  children: React.ReactNode;
  variant?: "prose" | "landing";
}) {
  return (
    <main className="min-h-dvh bg-stone-50">
      <SiteHeader />

      {variant === "landing" ? (
        children
      ) : (
        <article className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
          <h1 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">{title}</h1>
          {updatedLabel && <p className="mt-2 text-sm text-stone-500">{updatedLabel}</p>}
          <div className="legal-prose mt-8">{children}</div>
        </article>
      )}

      <SiteFooter />
    </main>
  );
}
