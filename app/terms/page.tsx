import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Solar Pixel's Terms of Service, including our site survey fee and equipment warranty policy.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service" updatedLabel="Last updated: August 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of Solar Pixel&apos;s website and your
        engagement of Solar Pixel for solar system quotation, site survey, and installation services in Pakistan.
        By requesting a quote or engaging our services, you agree to these Terms.
      </p>

      <h2>1. Instant Quotations Are Estimates</h2>
      <p>
        The price shown by our online calculator is an instant, indicative estimate based on the information you
        provide (your electricity bill, property type, and equipment preferences). It is not a binding price. Your
        final, binding price is determined only after a site survey (see Section 2) confirms the exact equipment
        and installation requirements for your property.
      </p>

      <h2>2. Site Survey Fee</h2>
      <p>
        <strong>
          Before we can issue a final, binding quotation, one of our field engineers must visit your site to
          measure the exact roof, wiring, and load conditions. This site survey costs a flat fee of Rs 5,000.
        </strong>{" "}
        This fee covers the engineer&apos;s visit, measurement, and preparation of your exact Bill of Quantities.
        The site survey fee is disclosed to you before you agree to a site visit and is separate from the cost of
        your solar system itself.
      </p>

      <h2>3. Equipment Warranties</h2>
      <p>
        <strong>
          Solar Pixel does not provide any direct warranty of its own on solar panels, inverters, batteries, or any
          other equipment we supply and install. All equipment warranties are strictly the manufacturer&apos;s
          warranties for that specific product, and are governed entirely by that manufacturer&apos;s standard
          warranty terms and claim procedures as they apply in Pakistan.
        </strong>{" "}
        Warranty periods and terms vary by manufacturer and product and will be provided to you at the time of
        installation. Any warranty claim must be made directly through the applicable manufacturer&apos;s standard
        process; Solar Pixel will assist in facilitating a claim where reasonably possible, but is not itself the
        warrantor.
      </p>
      <p>
        Solar Pixel does separately warrant the quality of its own installation workmanship for a period to be
        confirmed in your installation contract — this is distinct from, and does not extend, any manufacturer
        equipment warranty.
      </p>

      <h2>4. Pricing &amp; Payment</h2>
      <p>
        Pricing for equipment and installation is based on real, current market rates at the time your quotation is
        issued and confirmed at site survey. Specific payment terms (deposit, milestone, or full payment) for your
        installation will be set out in your individual installation contract.
      </p>

      <h2>5. Cancellation</h2>
      <p>
        You may cancel a quotation request at any time before signing an installation contract at no charge, other
        than the site survey fee described in Section 2 if a survey has already been carried out. Cancellation
        terms after a contract is signed will be set out in that contract.
      </p>

      <h2>6. No Net Metering / WAPDA Paperwork</h2>
      <p>
        Our systems are designed and installed without requiring WAPDA net-metering interconnection paperwork. This
        does not affect the equipment warranty terms described in Section 3.
      </p>

      <h2>7. Limitation of Liability</h2>
      <p>
        To the fullest extent permitted under the laws of Pakistan, Solar Pixel&apos;s liability for any claim
        arising from our services is limited to the amount you actually paid us for the relevant installation.
        Solar Pixel is not liable for indirect or consequential losses, or for equipment failures covered by a
        manufacturer&apos;s warranty under Section 3.
      </p>

      <h2>8. Governing Law</h2>
      <p>These Terms are governed by the laws of Pakistan, and any dispute will be subject to the jurisdiction of the courts of Lahore, Punjab.</p>

      <h2>9. Contact Us</h2>
      <p>Questions about these Terms? Reach us on WhatsApp or by email — see the footer below.</p>
    </LegalPageShell>
  );
}
