"use client";

import type { ComponentType } from "react";
import { Info, Calculator, MessageCircle, Mail, Phone, Globe } from "lucide-react";
import {
  WHATSAPP_BUSINESS_NUMBER,
  GENERAL_INQUIRY_WA_MESSAGE,
  WEBSITE_URL,
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_TEL,
} from "@/lib/constants/contact";
import { trackWhatsAppClick } from "@/lib/analytics";

/**
 * The one real site footer (2026-09-05, "footer should remain the same
 * across the application... don't you think so?" — yes). Same story as
 * SiteHeader.tsx: this Bang & Olufsen-style footer (giant vertical
 * "SOLAR"/"PIXEL" wordmarks, real Contact/Social/Legal columns) used to
 * live only inside app/HomePageContent.tsx; every other page had its own
 * much plainer "© Solar Pixel · 4 links" footer instead. Genuinely no
 * client-only state needed except the WhatsApp click-tracking handlers
 * below — "use client" for that reason alone, same as SiteHeader.
 */
export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-[#0a0714] text-white print:hidden">
      <div className="mx-auto flex max-w-7xl">
        {/* LEFT EDGE: "SOLAR", vertical, bottom-to-top. Hidden below md —
            at narrow widths there's no room for a full-height typographic
            column without crushing the center content. */}
        <div className="hidden shrink-0 border-r border-white/10 md:flex md:items-center md:justify-center md:px-1 lg:px-4">
          <span
            aria-hidden
            className="pointer-events-none select-none whitespace-nowrap font-black uppercase leading-none tracking-tight text-white/[0.07]"
            style={{ writingMode: "vertical-lr", transform: "rotate(180deg)", fontSize: "clamp(3.5rem, 9vw, 8rem)" }}
          >
            Solar
          </span>
        </div>

        {/* CENTER: standard footer link columns */}
        <div className="flex-1 px-6 py-16 sm:px-10 sm:py-20">
          <div className="mx-auto grid max-w-4xl gap-10 text-center sm:grid-cols-2 sm:text-left lg:grid-cols-4">
            <FooterColumn title="Company">
              <FooterLink href="/about" icon={Info}>
                About Us
              </FooterLink>
              <FooterLink href="/#calculator" icon={Calculator}>
                Live Calculator
              </FooterLink>
            </FooterColumn>

            <FooterColumn title="Contact">
              <FooterLink
                href={`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(GENERAL_INQUIRY_WA_MESSAGE)}`}
                icon={MessageCircle}
                onClick={() => trackWhatsAppClick("footer_contact")}
              >
                WhatsApp
              </FooterLink>
              <FooterLink href={`mailto:${CONTACT_EMAIL}`} icon={Mail}>
                {CONTACT_EMAIL}
              </FooterLink>
              <FooterLink href={`tel:${CONTACT_PHONE_TEL}`} icon={Phone}>
                {CONTACT_PHONE_DISPLAY}
              </FooterLink>
            </FooterColumn>

            <FooterColumn title="Social">
              <FooterLink
                href={`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(GENERAL_INQUIRY_WA_MESSAGE)}`}
                icon={MessageCircle}
                onClick={() => trackWhatsAppClick("footer_social")}
              >
                Message Us
              </FooterLink>
              <FooterLink href={WEBSITE_URL} icon={Globe}>
                www.solarpixel.pk
              </FooterLink>
            </FooterColumn>

            <FooterColumn title="Legal">
              <a href="/privacy-policy" className="block text-sm text-white/70 transition-colors duration-200 hover:text-white">
                Privacy Policy
              </a>
              <a href="/terms" className="block text-sm text-white/70 transition-colors duration-200 hover:text-white">
                Terms of Service
              </a>
            </FooterColumn>
          </div>

          <div className="mx-auto mt-14 max-w-3xl border-t border-white/10 pt-6 text-center text-xs text-white/40 sm:text-left">
            <p className="max-w-md sm:mx-0 mx-auto">
              Smart Solar for Residential, Commercial and Industrial. No net billing, no green meters. Just a
              system that goes live fast.
            </p>
            <p className="mt-2">
              © {new Date().getFullYear()} Solar Pixel. Estimates are indicative and confirmed after an on-site
              engineering survey (Rs 5,000 fee applies).
            </p>
          </div>
        </div>

        {/* RIGHT EDGE: "PIXEL", vertical, top-to-bottom */}
        <div className="hidden shrink-0 border-l border-white/10 md:flex md:items-center md:justify-center md:px-1 lg:px-4">
          <span
            aria-hidden
            className="pointer-events-none select-none whitespace-nowrap font-black uppercase leading-none tracking-tight text-white/[0.07]"
            style={{ writingMode: "vertical-rl", fontSize: "clamp(3.5rem, 9vw, 8rem)" }}
          >
            Pixel
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">{title}</p>
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}

function FooterLink({
  href,
  icon: Icon,
  onClick,
  children,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 text-sm text-white/70 transition-colors duration-200 hover:text-white sm:justify-start"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </a>
  );
}
