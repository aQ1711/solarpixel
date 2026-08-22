import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Solar Pixel is a Lahore-based solar installer built on radical transparency and open engineering, with real brand pricing, an itemized quotation for every system, and no hidden fees.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <LegalPageShell title="About Solar Pixel">
      <p>
        Solar Pixel installs Hybrid (Battery) and On-Grid solar systems for homes and businesses across Lahore
        and Punjab. We size and price every system from real, live market data, not a rough estimate, and we
        aim to have a new system live in as little as 48 hours.
      </p>

      <h2>Radical Transparency</h2>
      <p>
        Every quotation we send breaks down exactly what you&apos;re paying for: panels, inverter, battery,
        cabling &amp; protection, mounting structure, installation, and site works, each priced from the real
        brand and model we&apos;re proposing, not a blended guess. Our public Market Watch pricing and our own
        internal pricing are both drawn from the same real vendor market data we track, so the number you see on
        our calculator and the number on your final quotation never drift apart for no reason.
      </p>

      <h2>Open Engineering</h2>
      <p>
        Every system starts with an instant, honest estimate based on the information you give us. Before any
        contract is signed, one of our field engineers visits your site to measure the exact roof, wiring, and
        load conditions, and that measured Bill of Quantities is what your final price is actually built from.
        It is not the pre-survey guess. We tell you upfront when a site visit is required and what it costs; see
        our <a href="/terms">Terms of Service</a> for the current site survey fee.
      </p>

      <h2>No Hidden Fees</h2>
      <p>
        If a cost applies to your system, it&apos;s in your quotation before you commit, not added afterward.
        That includes our site survey fee, which we disclose upfront rather than folding into a bigger number
        later.
      </p>

      <h2>Talk to Us</h2>
      <p>
        Have a question before you get a quote? Reach us on WhatsApp or email, see the footer below, or use the
        calculator to get an instant, no-obligation estimate.
      </p>
    </LegalPageShell>
  );
}
