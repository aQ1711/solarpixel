/**
 * Normalizes a Google Drive share link into a direct-embeddable link.
 * Isomorphic (no server-only imports) — used both client-side in
 * /admin/pricing's Add/Edit Material modal (on blur, for instant preview)
 * and server-side in lib/db/admin.ts (on every create/update), which is
 * the actual source of truth: the server never trusts that the client
 * already normalized what it sent.
 *
 * Recognizes the two common share-link shapes:
 *   https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 *   https://drive.google.com/open?id=FILE_ID
 * and converts either to:
 *   https://drive.google.com/uc?export=view&id=FILE_ID
 *
 * Idempotent — running an already-normalized link (or one already in the
 * uc?...&id= form) back through this function returns it unchanged, so
 * re-formatting on every save is always safe. Anything that isn't a
 * drive.google.com URL (including an invalid/empty string) is returned
 * untouched rather than mangled or rejected — format validation is the
 * caller's job (see the Zod schemas in /api/admin/pricing).
 */
export function formatGoogleDriveLink(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed; // not an absolute URL at all — leave it for the caller's own validation
  }

  if (parsed.hostname !== "drive.google.com") return trimmed;

  const pathMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  const fileId = pathMatch?.[1] ?? parsed.searchParams.get("id");
  if (!fileId) return trimmed;

  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}
