"use server";

import "server-only";
import { z } from "zod";
import { generateObject, APICallError } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { isSuperAdminSecret } from "@/lib/auth/internal-guard";

/**
 * Marketing Hub — AI weekly content strategy generator (2026-08-26,
 * switched from Anthropic to Gemini same day — see MOCK_FALLBACK_PLAN's
 * doc comment for why the provider choice matters here specifically).
 *
 * A Server Action, not an /api/admin/* route handler like every other
 * piece of backend logic in this codebase — an explicit, deliberate
 * choice this one time (every other feature this session went through
 * the route-handler pattern for consistency; this file's exact path was
 * a specific requirement). Auth follows the same shared-secret model as
 * everywhere else (lib/auth/internal-guard.ts) but a Server Action never
 * receives a NextRequest to read `x-internal-token` off, so the client
 * passes the token it already holds (lib/internal/access.ts's
 * getStoredToken("ADMIN")) as a plain argument instead — same secret,
 * same comparison function (isSuperAdminSecret), different transport.
 *
 * Not real token-by-token streaming to the client — see this file's own
 * README note / the chat explanation for why: Server Actions don't
 * naturally support that the way an API route's ReadableStream response
 * does, and the fragile experimental `ai/rsc` streaming helpers weren't
 * worth the risk for a first version. The felt "smooth loading" comes
 * from the client's own skeleton/reveal animation instead — see
 * app/admin/marketing/page.tsx.
 */

// ============================================================================
// Model choice (2026-08-26): the brief asked for "gemini-1.5-flash"
// specifically, for its free-tier headroom + speed. Verified LIVE against
// the real Gemini API with the key actually in hand before writing any
// of this: gemini-1.5-flash returns a hard 404 (models.list confirms
// it's fully retired, not just deprecated-with-a-warning). Substituted
// the closest current equivalent to the STATED INTENT (fast, cheap,
// free-tier-friendly) rather than either silently picking an unrelated
// model or leaving a broken model ID in — Google's "-flash-lite" tier is
// the direct successor to what 1.5-flash was for: their explicitly
// cost/speed-optimized tier, same positioning 1.5-flash had. Not a
// preview/experimental tag, so it should be stable.
const GEMINI_MODEL_ID = "gemini-3.1-flash-lite";

// ============================================================================
// Hardcoded brand/strategy context — per the brief, verbatim. Deliberately
// NOT admin-editable (unlike GlobalPricingSettings elsewhere in this
// app) — this is marketing strategy copy, not a pricing rate; making it
// editable wasn't asked for and would need its own storage + admin UI.
// ============================================================================
const SYSTEM_PROMPT = `You are the in-house social media strategist for Solar Pixel, Lahore's premier digital-first solar engineering platform.

BRAND & USP:
- Radical transparency, a 60-second online quote, premium engineering.

STRATEGY:
- Organic TikTok/Reels first. Boost only the top-performing organic posts with a strict 30,000 PKR/month budget (1,000 PKR/day) — never suggest a budget above this.

TONE & LANGUAGE:
- Conversational, relatable, zero corporate jargon. Mix Roman Urdu hooks with English technical terms (the way a young, well-informed Lahori actually talks about solar) — never write pure formal Urdu or pure stiff English.

TARGET AUDIENCE:
- Homeowners in DHA, Bahria Town, and Gulberg, and commercial plaza owners in Lahore.

STRICT GUARDRAILS (never violate these):
- NEVER mention the Rs 5,000 site survey/audit fee anywhere in social copy.
- The ONLY call to action, in every single piece of content, is driving the viewer to solarpixel.pk to check their exact quote in 60 seconds. Never suggest DMs, comments, calling a number, or visiting a physical location as the CTA.

Generate content that sounds like it was written by someone who actually lives in Lahore and understands LESCO bills, load-shedding, and the real economics of going solar here — not a generic global solar marketing template.`;

const tiktokScriptSchema = z.object({
  hookRomanUrdu: z
    .string()
    .describe("The first 1-2 spoken lines, in Roman Urdu, designed to stop the scroll in the first 3 seconds."),
  visualDirections: z
    .string()
    .describe("Shot-by-shot visual/on-screen-text directions for filming this script, written for whoever's holding the phone."),
  fullScript: z
    .string()
    .describe("The complete spoken script, start to finish, in the brand's Roman-Urdu-plus-English-technical-terms voice, ending on the solarpixel.pk 60-second-quote CTA."),
});

const contentPlanSchema = z.object({
  tiktokScript1: tiktokScriptSchema.describe(
    "Viral hook script built around LESCO electricity rates/bills — the pain point that gets shares and comments."
  ),
  tiktokScript2: tiktokScriptSchema.describe(
    "Trust/engineering-credibility script — solar panel efficiency or panel washing/maintenance, establishing Solar Pixel as the technically serious option."
  ),
  metaAd: z.object({
    headline: z.string().describe("Short Meta ad headline (under ~40 characters), for boosting the winning organic post or a retargeting campaign."),
    primaryText: z
      .string()
      .describe("The Meta ad's primary text — a few short lines, same brand voice, ending on the solarpixel.pk 60-second-quote CTA."),
  }),
});

export type ContentPlan = z.infer<typeof contentPlanSchema>;

export type GenerateContentPlanResult =
  | { success: true; plan: ContentPlan; fallback: false }
  | { success: true; plan: ContentPlan; fallback: true; error: string }
  | { success: false; error: string };

// ============================================================================
// Mock Fallback — a real, hand-written, on-brand/on-guardrail example
// plan, returned (never silently — always tagged `fallback: true` so the
// UI can say so plainly) when Gemini's free tier is rate-limited (429).
// This is NOT placeholder/lorem-ipsum content: it's a genuinely usable
// example that happens to be static rather than freshly generated, the
// same "never fabricate, degrade honestly instead of breaking" pattern
// this codebase uses everywhere else a live dependency can fail.
// ============================================================================
const MOCK_FALLBACK_PLAN: ContentPlan = {
  tiktokScript1: {
    hookRomanUrdu: "Bhai aap ka LESCO bill bhi 40,000 se upar hai? Ye video dekhne ke baad aap ka blood boil ho jayega...",
    visualDirections:
      "Open on a real LESCO bill held up to camera, thumb tapping the total. Cut to a simple on-screen calculator graphic showing units x rate. End on the solarpixel.pk homepage on a phone screen, calculator visible.",
    fullScript:
      "Bhai aap ka LESCO bill bhi 40,000 se upar hai? Dekho, ye jo per-unit rate hai na, ye slab system ke wajah se exponentially barh raha hai — jitni zyada units, utna zyada per-unit charge. Matlab aap already zyada de rahe hain sirf isliye ke aap zyada consume kar rahe hain. Solar pe shift karo, sirf bill kam nahi hota, aap poore slab system se bahar nikal jaate ho. Solarpixel.pk pe jao, 60 second mein apna exact quote nikalo — no guesswork, real engineering.",
  },
  tiktokScript2: {
    hookRomanUrdu: "Sab kehte hain solar panels lagao, koi nahi batata efficiency actually kaise maintain hoti hai.",
    visualDirections:
      "Drone/wide shot of a real panel installation, then close-up of panel washing in progress. Split-screen: dusty panel output reading vs freshly washed panel output reading on an inverter app.",
    fullScript:
      "Sab kehte hain solar panels lagao, koi nahi batata efficiency actually kaise maintain hoti hai. Lahore ki dust aur smog panels ki output 15-20% tak gira deti hai agar wash na karo. Ye sirf panels lagane ka game nahi, iske peeche real engineering hai — sahi tilt angle, sahi inverter sizing, aur regular maintenance. Yehi wajah hai Solar Pixel sirf installation nahi, poora engineering solution deta hai. Solarpixel.pk pe apna system 60 second mein size karwao, dekho real numbers ke sath.",
  },
  metaAd: {
    headline: "Apna Solar Quote 60 Second Mein Nikalo",
    primaryText:
      "LESCO bill se tang aa gaye? Solar Pixel — Lahore ka digital-first solar engineering platform. Real pricing, real engineering, no sales calls. Solarpixel.pk pe jao, apna exact quote abhi dekho.",
  },
};

const googleAI = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateContentPlan(input: {
  token: string;
  /** A quick-feedback instruction from one of the regenerate buttons
   *  (e.g. "Make Hook Aggressive") — appended as a real instruction, not
   *  just noted, so a regeneration actually reflects it. */
  feedback?: string;
  /** The previous plan, when this is a regeneration — passed back to the
   *  model so it REVISES the existing scripts against the feedback
   *  instead of writing three unrelated new ones from scratch. */
  previousPlan?: ContentPlan;
}): Promise<GenerateContentPlanResult> {
  if (!isSuperAdminSecret(input.token)) {
    return { success: false, error: "Unauthorized" };
  }

  if (!process.env.GEMINI_API_KEY) {
    // Fails honestly and immediately rather than letting the AI SDK
    // throw its own less-helpful error deep in the call stack — same
    // "never fabricate, degrade honestly" convention as every other
    // "not configured yet" gap in this codebase (e.g. bill-upload OCR's
    // own error paths).
    return {
      success: false,
      error: "AI generation isn't configured yet — GEMINI_API_KEY is missing from the server environment.",
    };
  }

  const promptParts: string[] = [
    "Generate this week's content strategy: 2 TikTok/Reels scripts and 1 Meta ad, per your system instructions.",
  ];
  if (input.previousPlan) {
    promptParts.push(`Here is the previous version to revise:\n${JSON.stringify(input.previousPlan, null, 2)}`);
  }
  if (input.feedback) {
    promptParts.push(`Apply this specific direction to the ${input.previousPlan ? "revision" : "new plan"}: ${input.feedback}`);
  }

  try {
    const { object } = await generateObject({
      model: googleAI(GEMINI_MODEL_ID),
      schema: contentPlanSchema,
      instructions: SYSTEM_PROMPT,
      prompt: promptParts.join("\n\n"),
    });
    return { success: true, plan: object, fallback: false };
  } catch (err) {
    const isRateLimited = APICallError.isInstance(err) && err.statusCode === 429;
    if (isRateLimited) {
      // Free-tier quota hit — a real, expected condition, not a bug.
      // Return the static example plan rather than a bare error, but
      // tagged `fallback: true` so the UI is honest about it instead of
      // presenting static copy as if it were freshly written.
      return {
        success: true,
        plan: MOCK_FALLBACK_PLAN,
        fallback: true,
        error: "Gemini's free-tier rate limit was reached — showing a saved example instead. Try again in a minute for a fresh one.",
      };
    }
    console.error("[generateContentPlan]", err);
    return { success: false, error: "Content generation failed. Please try again." };
  }
}
