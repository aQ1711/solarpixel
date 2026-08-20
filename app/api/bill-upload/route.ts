import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { recognize } from "tesseract.js";
import { saveUploadedBillFile, UploadValidationError } from "@/lib/storage/local";

// ============================================================================
// POST /api/bill-upload — extract bill details from a customer-uploaded
// PDF or photo of their own electricity bill.
//
// WHY THIS EXISTS INSTEAD OF SCRAPING BY REFERENCE NUMBER: that approach
// was built and live-tested against the real LESCO portal, but the actual
// bill content is gated behind a 4-digit CAPTCHA — confirmed by reaching
// that exact screen with a real, valid reference number. Rather than
// attempt to defeat that (bot-detection bypass, out of scope regardless
// of whose site it is), this route has the customer upload their own
// bill directly instead — fully consensual, no scraping, no CAPTCHA.
//
// HOW PARSING WORKS: LESCO's bill layout draws all its field LABELS
// ("Reference No", "Current Bill", "Tariff Category", …) as part of a
// background image/graphic, not as extractable text — confirmed by
// diffing a real bill PDF's text layer against its visual rendering: the
// labels are completely absent from the PDF's text, only values are
// real text. So a plain PDF-text parse can recover values but not which
// field each belongs to. Instead, both PDF and image uploads go through
// ONE shared pipeline:
//   1. If it's a PDF, render page 1 to a PNG first (pdf-parse's
//      getScreenshot — pure JS, no native canvas / system binaries,
//      works on Vercel/Lambda/Cloudflare Workers; confirmed against a
//      real bill).
//   2. Run OCR (tesseract.js) on the image — OCR reads pixels, so it
//      recovers the labels that ARE visually present even though they
//      weren't real PDF text.
//   3. Parse the OCR'd text with a label-anchored heuristic: find each
//      known label's position, then take the nearest number/text before
//      the next known label starts (bounds the search window so
//      OCR-merged table cells don't bleed into each other).
//
// OCR is inherently noisier than parsing real text or HTML — this
// returns `null` for anything it isn't reasonably confident about rather
// than guessing, same rule as everywhere else in this project: never
// fabricate a value we don't actually know. `currentBillPKR` is the one
// field the sizing calculator depends on; everything else is
// informational display data for the Bill Details panel.
// ============================================================================

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]);

export interface UploadedBillDetails {
  source: "uploaded_pdf" | "uploaded_image";
  /** Public URL of the saved original file, for the Super Admin to
   *  cross-check later in the Checker dashboard — see Quote.uploadedBillFileUrl.
   *  Null if the save itself failed; that's never fatal to this endpoint
   *  since the OCR'd fields below are still fully usable without it. */
  fileUrl: string | null;
  /** null only when we genuinely couldn't extract a usable bill amount —
   *  caller must fall back to asking the customer to enter it manually. */
  currentBillPKR: number | null;
  unitsConsumed: number | null;
  consumerId: string | null;
  consumerName: string | null;
  address: string | null;
  tariffCategory: string | null;
  sanctionedLoadKw: number | null;
  billingMonth: string | null;
  readingDate: string | null;
  issueDate: string | null;
  dueDate: string | null;
  arrearsPKR: number;
  totalPayablePKR: number | null;
  lpSurchargePKR: number | null;
  payableAfterDueDatePKR: number | null;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Upload a PDF or photo of your bill." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File is too large — max ${MAX_FILE_BYTES / (1024 * 1024)}MB.` },
        { status: 400 }
      );
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only PDF, JPG, PNG, WEBP, or HEIC files are supported." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const isPdf = file.type === "application/pdf";

    const imageBuffer = isPdf ? await renderPdfFirstPage(buffer) : buffer;
    if (!imageBuffer) {
      return NextResponse.json(
        {
          error:
            "Couldn't read that PDF. Try uploading a photo of your bill instead, or enter your bill amount manually.",
        },
        { status: 422 }
      );
    }

    const ocrText = await runOcr(imageBuffer);
    const fields = parseBillText(ocrText);

    if (fields.currentBillPKR === null) {
      return NextResponse.json(
        { error: "Couldn't make out your bill amount from that file. Try a clearer photo, or enter it manually." },
        { status: 422 }
      );
    }

    // Persist the original file so the Super Admin can view it later in
    // the Checker dashboard (see Quote.uploadedBillFileUrl). Deliberately
    // non-fatal: the OCR'd fields above are already fully usable on
    // their own, so a storage hiccup shouldn't block the customer.
    let fileUrl: string | null = null;
    try {
      fileUrl = await saveUploadedBillFile(file, "bills");
    } catch (err) {
      if (err instanceof UploadValidationError) {
        console.error("[POST /api/bill-upload] file save rejected:", err.message);
      } else {
        console.error("[POST /api/bill-upload] file save failed:", err);
      }
    }

    const result: UploadedBillDetails = { source: isPdf ? "uploaded_pdf" : "uploaded_image", fileUrl, ...fields };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[POST /api/bill-upload] failed:", err);
    return NextResponse.json(
      { error: "Couldn't process that file. Enter your bill amount manually instead." },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// PDF → image, then OCR
// ----------------------------------------------------------------------------

async function renderPdfFirstPage(buffer: Buffer): Promise<Buffer | null> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getScreenshot({ scale: 2, partial: [1] });
    const page = result.pages[0];
    if (!page?.data) return null;
    return Buffer.isBuffer(page.data) ? page.data : Buffer.from(page.data);
  } catch (err) {
    console.error("[bill-upload] PDF render failed:", err);
    return null;
  } finally {
    await parser.destroy();
  }
}

async function runOcr(imageBuffer: Buffer): Promise<string> {
  // First call in a cold serverless instance downloads ~10-15MB of
  // English trained-data (cached for subsequent calls) — expect a slower
  // first request.
  const {
    data: { text },
  } = await recognize(imageBuffer, "eng");
  return text;
}

// ----------------------------------------------------------------------------
// Label-anchored parsing of OCR'd text
// ----------------------------------------------------------------------------

const KNOWN_LABELS = [
  "reference no",
  "consumer id",
  "transformer",
  "category",
  "feeder code",
  "mdi",
  "sub division",
  "san load",
  "sanctioned load",
  "tariff category",
  "bill month",
  "reading date",
  "issue date",
  "due date",
  "payable within due date",
  "payable after due date",
  "l.p surcharge",
  "lp surcharge",
  "total electricity charges",
  "subsidies",
  "net electricity charges",
  "taxes",
  "current bill",
  "arrears",
  "installment",
  "adjustments",
  "grand total",
  "units consumed",
  "units",
  "name & address",
  "name and address",
];

type ParsedFields = Omit<UploadedBillDetails, "source" | "fileUrl">;

function parseBillText(text: string): ParsedFields {
  const arrearsPKR = findNumberNearLabel(text, "arrears") ?? 0;
  const totalPayablePKR =
    findNumberNearLabel(text, "grand total") ?? findNumberNearLabel(text, "payable within due date");

  // "Current Bill" sits in a table row directly beside its Urdu label
  // ("موجودہ بل"), and OCR frequently mangles the English text there
  // entirely — confirmed against a real bill, where it read as gibberish
  // while the label-anchored search for "current bill" simply found
  // nothing. Grand Total minus Arrears is a reliable stand-in: for the
  // (common) case of a customer with no arrears, it's exactly the same
  // number; with arrears, it's a close approximation of the current
  // period's charge, which is what the sizing calculator needs (not an
  // exact accounting figure).
  const currentBillPKR = findNumberNearLabel(text, "current bill") ?? (totalPayablePKR !== null ? totalPayablePKR - arrearsPKR : null);
  const payableAfterDueDatePKR = findNumberNearLabel(text, "payable after due date");
  const lpSurchargePKR = findNumberNearLabel(text, "l.p surcharge") ?? findNumberNearLabel(text, "lp surcharge");
  const unitsConsumed = findNumberNearLabel(text, "units consumed");
  const sanctionedLoadKw = findNumberNearLabel(text, "san load") ?? findNumberNearLabel(text, "sanctioned load");

  // OCR renders this bill's header as a full row of labels followed by a
  // full row of values (columns line up vertically, not label-then-value
  // inline) — so "Consumer ID"'s actual value is on the NEXT line, past
  // whatever other labels ("Feeder Code", …) sit between it and there on
  // the label row itself. A same-line/window search finds nothing useful;
  // look at the following line instead.
  const consumerIdNum = findNumberOnNextLine(text, "consumer id");
  const consumerId = consumerIdNum !== null ? String(consumerIdNum) : null;
  const tariffCategory = findTextNearLabel(text, "tariff category");
  const billingMonth = findTextNearLabel(text, "bill month");
  const readingDateRaw = findTextNearLabel(text, "reading date");
  const issueDateRaw = findTextNearLabel(text, "issue date");
  const dueDateRaw = findTextNearLabel(text, "due date");
  // OCR line-wraps name/address unpredictably — take whatever's
  // immediately after the label as a best-effort "consumer" line rather
  // than trying to reliably split name from address.
  const nameAddress = findTextNearLabel(text, "name & address") ?? findTextNearLabel(text, "name and address");

  return {
    currentBillPKR,
    unitsConsumed,
    consumerId,
    consumerName: nameAddress,
    address: null,
    tariffCategory,
    sanctionedLoadKw,
    billingMonth,
    readingDate: readingDateRaw ? normalizeDate(readingDateRaw) : null,
    issueDate: issueDateRaw ? normalizeDate(issueDateRaw) : null,
    dueDate: dueDateRaw ? normalizeDate(dueDateRaw) : null,
    arrearsPKR,
    totalPayablePKR,
    lpSurchargePKR,
    payableAfterDueDatePKR,
  };
}

/** Finds `label` in `text`, then returns the first number appearing after
 *  it and before whichever OTHER known label comes next — bounds the
 *  search window so we don't grab a neighboring field's value (OCR
 *  frequently runs adjacent table cells together on one line). */
function findNumberNearLabel(text: string, label: string): number | null {
  const window = extractWindowAfterLabel(text, label);
  if (window === null) return null;
  const match = window.match(/[\d,]+\.?\d*/);
  if (!match) return null;
  const num = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(num) && num > 0 ? num : null;
}

function findTextNearLabel(text: string, label: string): string | null {
  const window = extractWindowAfterLabel(text, label);
  if (window === null) return null;
  const match = window.match(/[A-Za-z][A-Za-z0-9 .\-/]{2,60}/);
  if (!match) return null;
  const value = match[0].trim();
  // Safety net: if what we "found" is itself just another known label
  // (bled in from an adjacent column — OCR often runs a whole row of
  // labels together before any values appear, and sometimes drops the
  // space in a multi-word label like "Sub Division" -> "SUBDIVISION"),
  // that's a false positive, not a real value. Better to admit we don't
  // know than show it as data.
  const normalizedValue = value.toLowerCase().replace(/\s+/g, "");
  const looksLikeLabel = KNOWN_LABELS.some((l) => {
    const normalizedLabel = l.replace(/\s+/g, "");
    return normalizedValue === normalizedLabel || normalizedLabel.startsWith(normalizedValue);
  });
  if (looksLikeLabel) return null;
  return value;
}

/** For fields whose value sits on the line below its label rather than
 *  immediately after it on the same line (this bill's header renders as
 *  a full row of labels, then a full row of values) — takes the first
 *  number on the next non-empty line following the label's line. */
function findNumberOnNextLine(text: string, label: string): number | null {
  const lines = text.split("\n");
  const labelLineIdx = lines.findIndex((line) => line.toLowerCase().includes(label));
  if (labelLineIdx === -1) return null;
  for (let i = labelLineIdx + 1; i < Math.min(labelLineIdx + 3, lines.length); i++) {
    const match = lines[i].match(/\d{4,}/); // IDs are multi-digit; skips stray 1-3 digit OCR noise
    if (match) return Number(match[0]);
  }
  return null;
}

function extractWindowAfterLabel(text: string, label: string): string | null {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(label);
  if (idx === -1) return null;
  const start = idx + label.length;

  let end = Math.min(text.length, start + 80);
  for (const other of KNOWN_LABELS) {
    if (other === label) continue;
    const otherIdx = lower.indexOf(other, start);
    if (otherIdx !== -1 && otherIdx < end) end = otherIdx;
  }
  return text.slice(start, end);
}

function normalizeDate(raw: string): string | null {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
