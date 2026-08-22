import { ImageResponse } from "next/og";

/**
 * Favicon (2026-08-22, Local SEO task) — this app had NO favicon at
 * all before this (confirmed: no public/favicon.ico, no app/icon.*).
 * Generated via next/og rather than requiring a pre-made image file,
 * same reasoning and same brand tokens as app/opengraph-image.tsx.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#05070c",
          borderRadius: 7,
        }}
      >
        <div style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: "#7c3aed" }} />
      </div>
    ),
    { ...size }
  );
}
