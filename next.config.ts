import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) resolves its worker script through a
  // dynamic import Turbopack can't statically follow when bundled —
  // confirmed by a standalone Node script working fine while the bundled
  // API route failed with "Setting up fake worker failed: Cannot find
  // module '.../pdf.worker.mjs'". Marking it (and tesseract.js, which
  // has the same worker/WASM-loading shape) external keeps them resolved
  // via normal Node module resolution at runtime instead of being bundled.
  //
  // pg-cloudflare is here for a different, Cloudflare-Worker-specific
  // reason (2026-08-25): Next's file-tracing step, which decides what
  // OpenNext copies into .open-next/server-functions/default/node_modules,
  // resolves this package's "exports" map using its "default" condition
  // and only copies dist/empty.js — the workerd build's actual runtime
  // require() (pg's lib/stream.js, gated on navigator.userAgent ===
  // 'Cloudflare-Workers', true in every real Worker regardless of
  // Hyperdrive) needs dist/index.js under the "workerd" condition, so the
  // OpenNext esbuild bundling step fails with "Could not resolve
  // pg-cloudflare" (confirmed open upstream bug:
  // github.com/opennextjs/opennextjs-cloudflare/issues/263). Marking it
  // external skips condition-based tracing and copies the whole package
  // directory verbatim, including dist/index.js.
  //
  // ".prisma/client" is the same story again: even with the generator's
  // engineType = "client" (no native/WASM query *engine*), Prisma still
  // loads a separate query *compiler* WASM module
  // (query_compiler_bg.wasm) at runtime via a plain fs read rather than
  // a static import, so Next's tracer never picks it up — confirmed
  // live: "no such file or directory, readAll
  // '/bundle/node_modules/.prisma/client/query_compiler_bg.wasm'".
  // External copies the whole generated-client directory verbatim.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "tesseract.js", "pg-cloudflare", ".prisma/client"],
};

export default nextConfig;

// The OpenNext Cloudflare `migrate` scaffolder (2026-08-25) added an
// unconditional `initOpenNextCloudflareForDev()` call here, meant for
// running plain `next dev` locally WITH live-emulated Cloudflare
// bindings (Hyperdrive, etc.). Removed: it fires on every single `next`
// invocation regardless of target — including a plain Netlify/local
// `next build`/`next dev`, which has no Cloudflare bindings at all —
// and once wrangler.jsonc gained real `hyperdrive` entries, it started
// hard-failing those completely unrelated builds with "you should use a
// local Postgres connection string to emulate Hyperdrive... set
// HYPERDRIVE_PUBLIC's localConnectionString" (verified live: `npm run
// build`, the Netlify/local path, crashed with exactly this error the
// moment the Hyperdrive bindings were added). Not needed for actually
// testing/deploying the Cloudflare build either — `opennextjs-cloudflare
// build`/`preview`/`deploy` handle their own binding resolution, this
// hook is specifically for interactive `next dev`. If live-emulated
// `next dev` against real Cloudflare bindings is ever wanted, re-add
// this gated behind an explicit opt-in (e.g. an env var only set when
// deliberately running that flow), never unconditionally.
