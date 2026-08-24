import { ImageResponse } from "next/og";

/**
 * Dynamic OG/Twitter share image (2026-08-22, Local SEO task) —
 * generated at request time via next/og (Satori), not a static asset:
 * there's no existing logo/brand image file in this repo to reference,
 * and generating one here means the image can never go stale or 404.
 * Built from the SAME real brand tokens the live site already uses
 * (dark #05070c background matches app/layout.tsx's themeColor,
 * orange-700 accent matches the storefront's primary orange after the
 * 2026-08-24 purple-to-orange rebrand — landed on this exact #e07a47
 * coral-orange after two live shade-review rounds, see
 * app/globals.css's custom orange-ramp @theme override for the full
 * story) — not an invented color scheme.
 */
export const alt = "Solar Pixel: Solar Installation Lahore";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          backgroundColor: "#05070c",
          backgroundImage: "radial-gradient(circle at 75% 30%, rgba(224,122,71,0.35), rgba(5,7,12,0) 60%)",
          padding: "80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              backgroundColor: "#e07a47",
            }}
          />
          <div style={{ fontSize: 34, fontWeight: 700, color: "#e7e5e4", letterSpacing: -0.5 }}>SOLAR PIXEL</div>
        </div>

        <div style={{ display: "flex", marginTop: 36, fontSize: 66, fontWeight: 800, color: "#ffffff", lineHeight: 1.08, maxWidth: 920 }}>
          Solar Installation in Lahore, Live in 48 Hours
        </div>

        <div style={{ display: "flex", marginTop: 28, fontSize: 30, color: "#a8a29e", maxWidth: 820 }}>
          Instant solar calculator · Real panel & inverter pricing · No WAPDA net metering paperwork
        </div>
      </div>
    ),
    { ...size }
  );
}
