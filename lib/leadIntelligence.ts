import "server-only";
import { UAParser } from "ua-parser-js";
import { isBot } from "ua-parser-js/bot-detection";
import type { NextRequest } from "next/server";
import type { DeviceType } from "@prisma/client";

/**
 * Lead Intelligence (2026-08-25) — everything captured server-side about
 * the visitor at the moment they submit a quote, never something they
 * fill in themselves. Every field is best-effort and nullable by design
 * (see each column's own doc comment in schema.prisma): a missing or
 * unparseable header degrades to null, it never blocks the quote
 * submission — same "capture never blocks the core flow" convention as
 * bill-upload OCR elsewhere in this codebase. Call extractLeadIntelligence()
 * from inside a try/catch at the call site regardless, as a second layer
 * of the same guarantee.
 */
export interface LeadIntelligence {
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: DeviceType | null;
  browserName: string | null;
  osName: string | null;
  detectedCity: string | null;
  detectedRegion: string | null;
  detectedCountry: string | null;
  detectedCountryCode: string | null;
  detectedLatitude: number | null;
  detectedLongitude: number | null;
  referrerUrl: string | null;
}

/**
 * `x-forwarded-for`/`x-real-ip` are safe to trust here specifically
 * because both platforms this app runs on (Vercel, Netlify) overwrite
 * these at their own edge before the request ever reaches app code —
 * see Vercel's own docs ("we currently overwrite the X-Forwarded-For
 * header and do not forward external IPs"). This is NOT a generally-safe
 * pattern for an app that might sit behind an arbitrary/unknown proxy,
 * where a client could spoof these headers directly.
 */
function resolveIpAddress(req: NextRequest): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // First entry is the original client; anything after is intermediate
    // proxies.
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}

/** ua-parser-js reports device.type as undefined for an ordinary
 *  desktop/laptop browser (there is no explicit "desktop" constant) —
 *  every other named type it *does* report (smarttv/console/wearable/xr/
 *  embedded) is real but not one of this app's 5 buckets, so it maps to
 *  UNKNOWN rather than being silently miscategorized as desktop. Bot
 *  detection runs first and wins regardless of what device.type says,
 *  since a crawler's UA string sometimes still parses as "mobile". */
function mapDeviceType(uaDeviceType: string | undefined, uaString: string): DeviceType {
  if (isBot(uaString)) return "BOT";
  if (uaDeviceType === "mobile") return "MOBILE";
  if (uaDeviceType === "tablet") return "TABLET";
  if (uaDeviceType === undefined) return "DESKTOP";
  return "UNKNOWN";
}

export function extractLeadIntelligence(req: NextRequest): LeadIntelligence {
  const userAgent = req.headers.get("user-agent");

  let deviceType: DeviceType | null = null;
  let browserName: string | null = null;
  let osName: string | null = null;
  if (userAgent) {
    const { browser, os, device } = new UAParser(userAgent).getResult();
    browserName = browser.name ?? null;
    osName = os.name ?? null;
    deviceType = mapDeviceType(device.type, userAgent);
  }

  // RFC3986-encoded per Vercel's own docs (non-ASCII city names) — absent
  // entirely on Netlify/localhost, no equivalent header there.
  const rawCity = req.headers.get("x-vercel-ip-city");
  let detectedCity: string | null = null;
  if (rawCity) {
    try {
      detectedCity = decodeURIComponent(rawCity);
    } catch {
      detectedCity = rawCity;
    }
  }

  // Vercel only ever supplies the ISO 3166-1 alpha-2 code, never a full
  // country name — Intl.DisplayNames (built into Node, no dependency)
  // renders "Pakistan" from "PK" for the admin-facing display.
  const countryCode = req.headers.get("x-vercel-ip-country");
  let detectedCountry: string | null = null;
  if (countryCode) {
    try {
      detectedCountry = new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? countryCode;
    } catch {
      detectedCountry = countryCode;
    }
  }

  const latRaw = req.headers.get("x-vercel-ip-latitude");
  const lngRaw = req.headers.get("x-vercel-ip-longitude");
  const detectedLatitude = latRaw !== null ? Number(latRaw) : null;
  const detectedLongitude = lngRaw !== null ? Number(lngRaw) : null;

  return {
    ipAddress: resolveIpAddress(req),
    userAgent,
    deviceType,
    browserName,
    osName,
    detectedCity,
    detectedRegion: req.headers.get("x-vercel-ip-country-region"),
    detectedCountry,
    detectedCountryCode: countryCode,
    detectedLatitude: Number.isFinite(detectedLatitude) ? detectedLatitude : null,
    detectedLongitude: Number.isFinite(detectedLongitude) ? detectedLongitude : null,
    referrerUrl: req.headers.get("referer"),
  };
}

/** Empty-but-valid LeadIntelligence — returned by the call site's
 *  try/catch fallback so a header-parsing failure degrades to "nothing
 *  captured" rather than failing the quote submission. */
export const EMPTY_LEAD_INTELLIGENCE: LeadIntelligence = {
  ipAddress: null,
  userAgent: null,
  deviceType: null,
  browserName: null,
  osName: null,
  detectedCity: null,
  detectedRegion: null,
  detectedCountry: null,
  detectedCountryCode: null,
  detectedLatitude: null,
  detectedLongitude: null,
  referrerUrl: null,
};
