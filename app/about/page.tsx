import type { Metadata } from "next";
import { Eye, Wrench, Receipt, MessageCircle, Mail, Zap, Gauge } from "lucide-react";
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
