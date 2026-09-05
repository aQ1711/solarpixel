import type { Metadata } from "next";
import { LegalPageShell, LegalSection } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Solar Pixel collects, uses, and protects your information when you request a solar quote.",
  alternates: { canonical: "/privacy-policy" },
};

// Same "one list drives both the TOC and each badge" pattern as
// app/terms/page.tsx — see that file's own doc comment. This page's
// sections never had leading numbers in their heading text to begin
// with (unlike Terms), so numbering them now is a pure presentation
// addition, not text removed from anywhere.
const SECTIONS = [
  { id: "information-we-collect", label: "Information We Collect" },
  { id: "how-we-use-it", label: "How We Use Your Information" },
  { id: "whatsapp", label: "WhatsApp Communication" },
  { id: "cookies", label: "Cookies & Analytics" },
  { id: "data-storage", label: "Data Storage & Security" },
  { id: "your-rights", label: "Your Rights" },
  { id: "governing-law", label: "Governing Law" },
  { id: "contact", label: "Contact Us" },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" updatedLabel="Last updated: August 2026" toc={SECTIONS}>
      <p>
        Solar Pixel (&quot;we&quot;, &quot;us&quot;) provides solar system quotations and installation services to
        customers in Lahore and Punjab, Pakistan. This policy explains what information we collect when you use
        our website or request a quote, and how we use it.
      </p>

      <LegalSection number={1} id={SECTIONS[0].id} title={SECTIONS[0].label}>
        <p>When you use our calculator or request a quote, we collect:</p>
        <ul>
          <li>
            <strong>Contact details:</strong> your name and WhatsApp/phone number, so we can send you your quotation
            and follow up.
          </li>
          <li>
            <strong>Electricity bill information:</strong> your average monthly bill amount, and if you choose to
            upload one, the electricity bill itself (PDF or photo, typically from WAPDA/LESCO). We use this only to
            size and price your solar system accurately.
          </li>
          <li>
            <strong>System preferences:</strong> the property type, service type, and equipment choices you select
            while configuring a quote.
          </li>
          <li>
            <strong>Site survey data:</strong> if you proceed to a paid site survey, our field engineer records
            measurements (roof type, cabling distances, existing electrical setup) needed to finalize your
            quotation.
          </li>
        </ul>
      </LegalSection>

      <LegalSection number={2} id={SECTIONS[1].id} title={SECTIONS[1].label}>
        <ul>
          <li>To calculate and send you an accurate solar system quotation.</li>
          <li>To contact you on WhatsApp or by phone about your quote, survey, or installation.</li>
          <li>To prepare the exact Bill of Quantities and contract for your system.</li>
          <li>To improve the accuracy of our pricing and sizing calculations.</li>
        </ul>
        <p>We do not sell your personal information to third parties.</p>
      </LegalSection>

      <LegalSection number={3} id={SECTIONS[2].id} title={SECTIONS[2].label}>
        <p>
          Quotes, follow ups, and scheduling are primarily handled over WhatsApp. When you click a &quot;Message Us
          on WhatsApp&quot; button, you&apos;re taken to WhatsApp with a prefilled message, and that conversation is
          then subject to WhatsApp&apos;s own privacy practices as well as ours.
        </p>
      </LegalSection>

      <LegalSection number={4} id={SECTIONS[3].id} title={SECTIONS[3].label}>
        <p>
          We use cookies for basic site functionality and, only if you accept our cookie banner, for analytics
          (such as Google Analytics or Meta Pixel) to understand how visitors use our site. If you decline, no
          analytics or advertising cookies are loaded. You can change your choice at any time by clearing your
          browser&apos;s local storage for this site.
        </p>
      </LegalSection>

      <LegalSection number={5} id={SECTIONS[4].id} title={SECTIONS[4].label}>
        <p>
          Your information is stored on secured servers. Access to your electricity bill, contact details, and quote
          history is restricted to Solar Pixel staff who need it to process your quote or installation.
        </p>
      </LegalSection>

      <LegalSection number={6} id={SECTIONS[5].id} title={SECTIONS[5].label}>
        <p>
          You can ask us to access, correct, or delete the personal information we hold about you at any time by
          contacting us using the details in our footer below.
        </p>
      </LegalSection>

      <LegalSection number={7} id={SECTIONS[6].id} title={SECTIONS[6].label}>
        <p>This policy is governed by the laws of Pakistan.</p>
      </LegalSection>

      <LegalSection number={8} id={SECTIONS[7].id} title={SECTIONS[7].label}>
        <p>Questions about this policy? Reach us on WhatsApp or by email. See the footer below.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
