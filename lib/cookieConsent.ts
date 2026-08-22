"use client";

/**
 * Shared localStorage-backed cookie consent state — read by
 * components/Analytics.tsx (to decide whether Meta Pixel/GA are allowed
 * to fire) and written by components/CookieConsent.tsx (the banner).
 * Kept as its own tiny module rather than folded into either component
 * so neither has to import the other, and so a future third consumer
 * (e.g. a settings page letting someone change their mind) has a single
 * place to read/write from.
 */

export type CookieConsentValue = "accepted" | "declined";

const STORAGE_KEY = "solarpixel.cookieConsent";
// Dispatched on `window` whenever the stored value changes, so
// already-mounted components (Analytics, in particular) can react
// immediately instead of only picking up the choice on next page load.
const CHANGE_EVENT = "solarpixel:cookie-consent-changed";

export function getCookieConsent(): CookieConsentValue | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "accepted" || value === "declined" ? value : null;
}

export function setCookieConsent(value: CookieConsentValue): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
}

/** Subscribes to consent changes; returns an unsubscribe function. Fires
 *  only on actual changes (via setCookieConsent), not on mount — callers
 *  that need the current value immediately should call
 *  getCookieConsent() themselves first. */
export function onCookieConsentChange(handler: (value: CookieConsentValue) => void): () => void {
  function listener(e: Event) {
    handler((e as CustomEvent<CookieConsentValue>).detail);
  }
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
