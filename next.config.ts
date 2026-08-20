import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) resolves its worker script through a
  // dynamic import Turbopack can't statically follow when bundled —
  // confirmed by a standalone Node script working fine while the bundled
  // API route failed with "Setting up fake worker failed: Cannot find
  // module '.../pdf.worker.mjs'". Marking it (and tesseract.js, which
  // has the same worker/WASM-loading shape) external keeps them resolved
  // via normal Node module resolution at runtime instead of being bundled.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "tesseract.js"],
};

export default nextConfig;
