import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Solar Pixel collects, uses, and protects your information when you request a solar quote.",
  alternates: { canonical: "/privacy-policy" },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" updatedLabel="Last updated: August 2026">
      <p>
        Solar Pixel (&quot;we&quot;, &quot;us&quot;) provides solar system quotations and installation services to
        customers in Lahore and Punjab, Pakistan. This policy explains what information we collect when you use
        our website or request a quote, and how we use it.
      </p>

      <h2>Information We Collect</h2>
      <p>When you use our calculator or request a quote, we collect:</p>
      <ul>
        <li>
          <strong>Contact details</strong> — your name and WhatsApp/phone number, so we can send you your quotation
          and follow up.
        </li>
        <li>
          <strong>Electricity bill information</strong> — your average monthly bill amount, and if you choose to
          upload one, the electricity bill itself (PDF or photo, typically from WAPDA/LESCO). We use this only to
          size and price your solar system accurately.
        </li>
        <li>
          <strong>System preferences</strong> — the property type, service type, and equipment choices you select
          while configuring a quote.
        </li>
        <li>
          <strong>Site survey data</strong> — if you proceed to a paid site survey, our field engineer records
          measurements (roof type, cabling distances, existing electrical setup) needed to finalize your
          quotation.
        </li>
      </ul>

      <h2>How We Use Your Information</h2>
      <ul>
        <li>To calculate and send you an accurate solar system quotation.</li>
        <li>To contact you on WhatsApp or by phone about your quote, survey, or installation.</li>
        <li>To prepare the exact Bill of Quantities and contract for your system.</li>
        <li>To improve the accuracy of our pricing and sizing calculations.</li>
      </ul>
      <p>We do not sell your personal information to third parties.</p>

      <h2>WhatsApp Communication</h2>
      <p>
        Quotes, follow-ups, and scheduling are primarily handled over WhatsApp. When you click a &quot;Message Us
        on WhatsApp&quot; button, you&apos;re taken to WhatsApp with a prefilled message — that conversation is
        then subject to WhatsApp&apos;s own privacy practices as well as ours.
      </p>

      <h2>Cookies &amp; Analytics</h2>
      <p>
        We use cookies for basic site functionality and, only if you accept our cookie banner, for analytics
        (such as Google Analytics or Meta Pixel) to understand how visitors use our site. If you decline, no
        analytics or advertising cookies are loaded. You can change your choice at any time by clearing your
        browser&apos;s local storage for this site.
      </p>

      <h2>Data Storage &amp; Security</h2>
      <p>
        Your information is stored on secured servers. Access to your electricity bill, contact details, and quote
        history is restricted to Solar Pixel staff who need it to process your quote or installation.
      </p>

      <h2>Your Rights</h2>
      <p>
        You can ask us to access, correct, or delete the personal information we hold about you at any time by
        contacting us using the details in our footer below.
      </p>

      <h2>Governing Law</h2>
      <p>This policy is governed by the laws of Pakistan.</p>

      <h2>Contact Us</h2>
      <p>Questions about this policy? Reach us on WhatsApp or by email — see the footer below.</p>
    </LegalPageShell>
  );
}
