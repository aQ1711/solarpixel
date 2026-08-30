/**
 * The real Solar Pixel brand mark (2026-08-29) — replaces the plain
 * `<span className="bg-orange-700 rounded-md" />` placeholder square that
 * stood in for it everywhere since the 2026-08-24 purple-to-orange
 * rebrand. Sourced from the official logo pack
 * ("/Users/tempuser/Documents/Solar Pixel /logo copy/svg/solarpixel-icon.svg"),
 * inlined here (not an <img> to a public/ file) for crisp rendering at
 * any size with no extra network request — same convention every other
 * hand-authored icon in this app already follows (see
 * app/HomePageContent.tsx's SolarPanelIcon/InverterIcon/etc.).
 *
 * No "use client" — plain, static SVG with no hooks or browser APIs, so
 * it renders fine imported into either a Server Component (e.g.
 * app/quote/[quoteId]/page.tsx) or a Client Component (e.g. the
 * storefront Header in app/HomePageContent.tsx) without a boundary
 * issue. One shared file rather than duplicating the SVG in each,
 * because a header logo is exactly the kind of thing that must never
 * silently drift between the two once it's later tweaked.
 *
 * `gradientId` defaults to a fixed string rather than React's `useId()`
 * — `useId` is a hook, and this component deliberately has no "use
 * client" so it can render from either a Server or a Client Component
 * tree (see above); hooks aren't available on the Server Component side.
 * Harmless today (rendered at most once per page), but override
 * `gradientId` with something unique if this ever needs to appear twice
 * on the same page, to avoid two <svg> elements sharing one <defs> id.
 */
export function BrandMark({ className, gradientId = "solarPixelMarkGradient" }: { className?: string; gradientId?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Solar Pixel" className={className}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EF9A6E" />
          <stop offset="0.55" stopColor="#E07A47" />
          <stop offset="1" stopColor="#AE4E1E" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${gradientId})`} />
      <rect x="15" y="15" width="8.7" height="8.7" rx="2.4" fill="rgba(255,255,255,0.24)" />
      <rect x="27.7" y="15" width="8.7" height="8.7" rx="2.4" fill="rgba(255,255,255,0.24)" />
      <rect x="40.3" y="15" width="8.7" height="8.7" rx="2.4" fill="#FFE7B3" />
      <rect x="15" y="27.7" width="8.7" height="8.7" rx="2.4" fill="rgba(255,255,255,0.24)" />
      <rect x="27.7" y="27.7" width="8.7" height="8.7" rx="2.4" fill="rgba(255,255,255,0.24)" />
      <rect x="40.3" y="27.7" width="8.7" height="8.7" rx="2.4" fill="rgba(255,255,255,0.24)" />
      <rect x="15" y="40.3" width="8.7" height="8.7" rx="2.4" fill="rgba(255,255,255,0.24)" />
      <rect x="27.7" y="40.3" width="8.7" height="8.7" rx="2.4" fill="rgba(255,255,255,0.24)" />
      <rect x="40.3" y="40.3" width="8.7" height="8.7" rx="2.4" fill="rgba(255,255,255,0.24)" />
    </svg>
  );
}
