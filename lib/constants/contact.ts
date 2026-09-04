/**
 * Real, public contact details — used across the storefront, the shared
 * SiteHeader/SiteFooter (2026-09-05, "header and footer should remain
 * the same across the application"), and anywhere else in the app that
 * needs to link out to WhatsApp/email/phone. Single source of truth:
 * previously WHATSAPP_BUSINESS_NUMBER/GENERAL_INQUIRY_WA_MESSAGE/
 * WEBSITE_URL/CONTACT_EMAIL/CONTACT_PHONE_* were defined twice inside
 * app/HomePageContent.tsx (once near the top for the old inline Header,
 * once near the bottom for the old inline Footer) — real duplication
 * risk if one copy ever got edited without the other. No behavior
 * change: identical values, just one place to edit them now.
 */
export const WHATSAPP_BUSINESS_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER || "923000000000";
export const GENERAL_INQUIRY_WA_MESSAGE = "Assalam o Alaikum! I'd like to learn more about Solar Pixel's solar systems.";
export const WEBSITE_URL = "https://www.solarpixel.pk";
export const CONTACT_EMAIL = "solarpixelpk@gmail.com";
export const CONTACT_PHONE_DISPLAY = "+92 328 2155550";
export const CONTACT_PHONE_TEL = "+923282155550";
