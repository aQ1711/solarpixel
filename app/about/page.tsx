import type { Metadata } from "next";
import { Eye, Wrench, Receipt, MessageCircle, Mail, Zap, Gauge, ChevronDown } from "lucide-react";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Solar Pixel is a Lahore based solar installer built on radical transparency and open engineering, with real brand pricing, an itemized quotation for every system, and no hidden fees.",
  alternates: { canonical: "/about" },
};

const WHATSAPP_BUSINESS_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER || "923000000000";
const WA_HREF = `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(
  "Assalam o Alaikum! I have a question before getting a quote from Solar Pixel."
)}`;

/**
 * FAQ content (2026-09-05, "do all the seo... top in Pakistan") — real,
 * already-established facts only, each one traceable to somewhere else
 * in this app (Terms of Service, the live calculator's own copy, the
 * real equipment catalog) rather than invented for SEO padding. Targets
 * genuine high-volume searches ("solar panel price in Pakistan," "do I
 * need net metering") with honest answers — the pricing/cost question
 * deliberately never states a specific Rs figure, since the real answer
 * depends on system size/brand and this app has no single verified
 * "average price" to quote; it points to the live calculator instead of
 * guessing a number. Rendered as native <details>/<summary> — no JS
 * needed, fully crawlable by search engines even collapsed (confirmed
 * Google policy: content inside closed <details> is indexed), and pairs
 * with the FAQPage JSON-LD below for a shot at a rich-result snippet.
 */
const FAQS = [
  {
    q: "How much does a solar system cost in Pakistan?",
    a: "It depends on your system size and the panel, inverter, and battery brand you choose. Use our live calculator to get an instant, real pricing estimate built from your own bill and equipment choice, no sales call required.",
  },
  {
    q: "How long does solar installation take?",
    a: "Once your quotation is confirmed after a site survey, we aim to have your system live in as little as 48 hours.",
  },
  {
    q: "Do I need WAPDA net metering approval?",
    a: "No. Our systems are designed and installed without requiring WAPDA net metering interconnection paperwork.",
  },
  {
    q: "What does the site survey cost?",
    a: "A flat fee of Rs 5,000, disclosed upfront before you agree to a site visit. It covers the engineer's visit, measurement, and preparation of your exact Bill of Quantities. See our Terms of Service for the full policy.",
  },
  {
    q: "What warranty do I get on my solar system?",
    a: "Panels, inverters, and batteries carry their own manufacturer's warranty. Solar Pixel separately warrants the quality of its own installation workmanship. See our Terms of Service for details.",
  },
  {
    q: "Which solar panel and inverter brands does Solar Pixel install?",
    a: "Real, in stock brands only, including Longi, Jinko, and Canadian Solar panels, and Huawei, Solis, Growatt, and Goodwe inverters. Pick your own brand and model with Build Your Own, or use our Recommended default.",
  },
  {
    q: "Can I get a solar system without a battery?",
    a: "Yes. An On Grid system (no battery) is available alongside our Hybrid + Battery option, for a lower upfront cost.",
  },
  {
    q: "Which areas does Solar Pixel serve?",
    a: "We install in Lahore and across Punjab. Our live calculator and real, current pricing data are available to anyone in Pakistan.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

/**
 * About page (2026-09-04, "market leading international level design") —
 * replaces what was a single narrow prose column (LegalPageShell's
 * default "prose" variant, still correctly used by Privacy/Terms — real
 * legal text belongs in one readable column) with a real landing-page
 * layout: dark hero, a visual 3-pillar grid, and a dedicated highlight
 * section for the upcoming energy-management product (explicit ask,
 * same turn) — while keeping every existing factual claim's WORDING
 * unchanged, only its presentation. Same header/footer chrome as every
 * other legal page, via LegalPageShell's new "landing" variant.
 */
const PILLARS = [
  {
    icon: Eye,
    title: "Radical Transparency",
    body: "Every quotation we send breaks down exactly what you're paying for: panels, inverter, battery, cabling & protection, mounting structure, installation, and site works, each priced from the real brand and model we're proposing, not a blended guess. Our public Market Watch pricing and our own internal pricing are both drawn from the same real vendor market data we track, so the number you see on our calculator and the number on your final quotation never drift apart for no reason.",
  },
  {
    icon: Wrench,
    title: "Open Engineering",
    body: (
      <>
        Every system starts with an instant, honest estimate based on the information you give us. Before any
        contract is signed, one of our field engineers visits your site to measure the exact roof, wiring, and load
        conditions, and that measured Bill of Quantities is what your final price is actually built from. It is not
        the pre survey guess. We tell you upfront when a site visit is required and what it costs; see our{" "}
        <a href="/terms" className="text-orange-700 underline underline-offset-2 hover:text-orange-800">
          Terms of Service
        </a>{" "}
        for the current site survey fee.
      </>
    ),
  },
  {
    icon: Receipt,
    title: "No Hidden Fees",
    body: "If a cost applies to your system, it's in your quotation before you commit, not added afterward. That includes our site survey fee, which we disclose upfront rather than folding into a bigger number later.",
  },
];

export default function AboutPage() {
  return (
    <LegalPageShell title="About Solar Pixel" variant="landing">
      {/* Static, hardcoded JSON-LD — never user input. Same convention
          as app/layout.tsx's own LocalBusiness script. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* ---- Hero — same dark-gradient language as the quotation/report
          hero elsewhere in this app, so "About" reads as the same
          product, not a bolted-on static page. ---- */}
      <div
        className="relative overflow-hidden px-5 py-16 text-white sm:py-24"
        style={{ background: "linear-gradient(155deg, #0F172A 0%, #0B1220 60%, #0B3B30 150%)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-400/15 blur-[120px]"
        />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-orange-400/10 blur-[120px]" />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Our Mission</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Solar, priced and engineered <span className="text-orange-400">honestly.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/70 sm:text-lg">
            Solar Pixel installs Hybrid (Battery) and On Grid solar systems for homes and businesses across Lahore
            and Punjab. We size and price every system from real, live market data, not a rough estimate, and we aim
            to have a new system live in as little as 48 hours.
          </p>
        </div>
      </div>

      {/* ---- Three pillars ---- */}
      <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <div className="grid gap-5 sm:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm shadow-stone-200/60 transition-shadow duration-200 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50">
                <Icon className="h-5 w-5 text-orange-700" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-stone-900">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{body}</p>
            </div>
          ))}
        </div>

        {/* ---- Coming Soon — the intelligent energy-management product
            (2026-09-04, explicit ask this turn: "our team is working on
            an intelligent solution to manage your bill yourself where
            you can control every Wattage in and out of your home").
            Deliberately vague on feature specifics/launch date — real
            content is the value proposition (real-time visibility and
            control over your own energy in/out), not a spec sheet or a
            promised date this page has no authority to commit to. Same
            dark-gradient hero language as above, so it reads as a real,
            forward-looking product announcement, not an afterthought. */}
        <div
          className="relative mt-6 overflow-hidden rounded-3xl px-6 py-10 text-white shadow-lg sm:px-10 sm:py-14"
          style={{ background: "linear-gradient(155deg, #0F172A 0%, #0B1220 60%, #0B3B30 150%)" }}
        >
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-emerald-400/15 blur-[110px]" />
          <div className="relative mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
              <Zap className="h-3 w-3" /> Coming Soon
            </span>
            <h2 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">Real Time Control Over Your Own Energy</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">
              Our team is building an intelligent energy management solution that puts you in control of every watt
              moving in and out of your home, in real time. See exactly what your system is generating, storing, and
              drawing from the grid, and manage your own electricity bill yourself, on your own terms.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2 text-xs font-medium text-white/50">
              <Gauge className="h-3.5 w-3.5" />
              In development. Launching soon.
            </div>
          </div>
        </div>
      </div>

      {/* ---- FAQ (2026-09-05, "do all the seo") — see FAQS's own doc
          comment above for content sourcing. <details>/<summary> keeps
          every answer in the DOM (and crawlable) even collapsed, no
          client component needed for the open/close interaction. ---- */}
      <div className="border-t border-stone-200 bg-stone-50 px-5 py-14 sm:py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            Frequently Asked Questions
          </h2>
          <div className="mt-8 space-y-3">
            {FAQS.map(({ q, a }) => (
              <details key={q} className="group rounded-2xl border border-stone-200 bg-white px-5 py-4 open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-stone-900 marker:content-none">
                  {q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-stone-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>

      {/* ---- Talk to Us ---- */}
      <div className="border-t border-stone-200 bg-white px-5 py-14 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-stone-900">Talk to Us</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">
            Have a question before you get a quote? Reach us on WhatsApp or email, or use the calculator to get an
            instant, no obligation estimate.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href={WA_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center gap-2 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-emerald-700"
            >
              <MessageCircle className="h-4 w-4" /> Message Us on WhatsApp
            </a>
            <a
              href="mailto:solarpixelpk@gmail.com"
              className="flex min-h-11 items-center gap-2 rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-700 transition-colors duration-200 hover:border-stone-400 hover:text-stone-900"
            >
              <Mail className="h-4 w-4" /> Email Us
            </a>
          </div>
        </div>
      </div>
    </LegalPageShell>
  );
}
