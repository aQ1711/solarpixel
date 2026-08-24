import Link from "next/link";

/**
 * Shared shell for the three static trust/legal pages (About, Privacy
 * Policy, Terms of Service) — a lightweight header + simple link footer,
 * NOT the full Bang & Olufsen-style Footer from app/HomePageContent.tsx
 * (that component lives inside a "use client" file built around the
 * interactive calculator's own state; these are plain static Server
 * Components with no need for any of that). Light theme, matching the
 * rest of the storefront (stone/orange palette).
 */
export function LegalPageShell({ title, updatedLabel, children }: { title: string; updatedLabel?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-stone-900">
            {/* Same "pixel" mark as the storefront Header — see its
                doc comment in app/HomePageContent.tsx. */}
            <span aria-hidden className="h-5 w-5 shrink-0 rounded-md bg-orange-700" />
            Solar Pixel
          </Link>
          <Link href="/#calculator" className="text-xs font-medium text-orange-700 hover:text-orange-800">
            Get Instant Quote →
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">{title}</h1>
        {updatedLabel && <p className="mt-2 text-sm text-stone-500">{updatedLabel}</p>}
        <div className="legal-prose mt-8">{children}</div>
      </article>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-stone-500">
          <p>© {new Date().getFullYear()} Solar Pixel.</p>
          <nav className="flex flex-wrap gap-4">
            <Link href="/" className="hover:text-stone-900">
              Home
            </Link>
            <Link href="/about" className="hover:text-stone-900">
              About Us
            </Link>
            <Link href="/privacy-policy" className="hover:text-stone-900">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-stone-900">
              Terms of Service
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
