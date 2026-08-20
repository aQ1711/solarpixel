"use client";

/**
 * Client-side counterpart to lib/auth/internal-guard.ts's interim
 * shared-secret gate. Stores the token the staff member enters in
 * sessionStorage (cleared when the tab closes) and attaches it to every
 * request the two internal dashboards make. Same caveat applies: this is
 * a placeholder, not real auth — see internal-guard.ts.
 */

import type { InternalRole } from "@/lib/auth/internal-guard";

function storageKey(role: InternalRole) {
  return `solarpixel.internalToken.${role}`;
}

export function getStoredToken(role: InternalRole): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(storageKey(role));
}

export function setStoredToken(role: InternalRole, token: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(storageKey(role), token);
}

export function clearStoredToken(role: InternalRole): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(storageKey(role));
}

/** fetch() wrapper that attaches the stored access token as a header. */
export async function internalFetch(role: InternalRole, input: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredToken(role);
  const headers = new Headers(init.headers);
  if (token) headers.set("x-internal-token", token);
  return fetch(input, { ...init, headers });
}
