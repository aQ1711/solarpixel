import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { assertMakerAccess, InternalAuthError } from "@/lib/auth/internal-guard";
import { saveUploadedFile, UploadValidationError } from "@/lib/storage/local";

const surveyFieldsSchema = z.object({
  quoteId: z.string().min(1, "quoteId is required"),
  engineerId: z.string().min(1, "engineerId is required"),
  roofType: z.enum(["RCC_CONCRETE", "CORRUGATED_METALLIC", "GROUND_MOUNT"]),
  structureChoice: z.enum(["STANDARD_L1_L2", "CUSTOM_ELEVATED"]),
  dcCableMeters: z.coerce.number().positive().max(2000),
  acCableMeters: z.coerce.number().positive().max(2000),
  dataCableMeters: z.coerce.number().positive().max(2000),
  requiresDbUpgrade: z.enum(["true", "false"]).transform((v) => v === "true"),
  engineerNotes: z.string().max(4000).optional(),
  // Field-Engineer-confirmed battery request (HYBRID_BATTERY quotes only —
  // the form omits the field entirely for ONGRID_ZERO_EXPORT, so this is
  // absent on the wire rather than sent as 0/null). See
  // SiteSurvey.surveyedBatteryCapacityKwh's doc comment in schema.prisma.
  surveyedBatteryCapacityKwh: z.coerce.number().positive().max(500).optional(),
});

const PHOTO_FIELD_TO_LABEL = {
  photoDbBox: "dbBox",
  photoRoof: "roof",
  photoMeter: "meter",
} as const;

/** POST /api/maker/survey — multipart/form-data. Creates the SiteSurvey,
 *  moves the Quote to MAKER_SUBMITTED, and logs the event, all in one
 *  transaction. Public-schema client only — Field Engineers never touch
 *  vendor_private (see lib/db/admin.ts). */
export async function POST(req: NextRequest) {
  const prisma = await getDb();
  try {
    assertMakerAccess(req);
  } catch (err) {
    if (err instanceof InternalAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  try {
    const formData = await req.formData();

    const raw = Object.fromEntries(
      [
        "quoteId",
        "engineerId",
        "roofType",
        "structureChoice",
        "dcCableMeters",
        "acCableMeters",
        "dataCableMeters",
        "requiresDbUpgrade",
        "engineerNotes",
        "surveyedBatteryCapacityKwh",
      ].map((key) => [key, formData.get(key) ?? undefined])
    );

    const parsed = surveyFieldsSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const quote = await prisma.quote.findUnique({ where: { id: input.quoteId } });
    if (!quote) {
      return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    }
    if (quote.status !== "AUTOMATED_ESTIMATE" && quote.status !== "SURVEY_SCHEDULED") {
      return NextResponse.json(
        { error: `This quote is already at status "${quote.status}".` },
        { status: 409 }
      );
    }

    const engineer = await prisma.user.findFirst({
      where: { id: input.engineerId, role: "FIELD_ENGINEER", isActive: true },
      select: { id: true },
    });
    if (!engineer) {
      return NextResponse.json({ error: "Selected engineer is not a valid, active Field Engineer." }, { status: 400 });
    }

    // Photos are optional — save whichever of the 3 labeled slots came
    // through as an actual file.
    const photos: Record<string, string | null> = { dbBox: null, roof: null, meter: null };
    for (const [field, label] of Object.entries(PHOTO_FIELD_TO_LABEL)) {
      const value = formData.get(field);
      if (value instanceof File && value.size > 0) {
        photos[label] = await saveUploadedFile(value, `site-surveys/${input.quoteId}`);
      }
    }

    const survey = await prisma.$transaction(async (tx) => {
      const created = await tx.siteSurvey.create({
        data: {
          quoteId: input.quoteId,
          engineerId: input.engineerId,
          visitDate: new Date(),
          dcCableMeters: input.dcCableMeters,
          acCableMeters: input.acCableMeters,
          dataCableMeters: input.dataCableMeters,
          roofType: input.roofType,
          structureChoice: input.structureChoice,
          dbUpgradeRequired: input.requiresDbUpgrade,
          surveyedBatteryCapacityKwh: input.surveyedBatteryCapacityKwh ?? null,
          photos,
          engineerNotes: input.engineerNotes || null,
        },
      });

      await tx.quote.update({
        where: { id: input.quoteId },
        data: {
          status: "MAKER_SUBMITTED",
          makerSubmittedAt: new Date(),
          makerSubmittedById: input.engineerId,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "QUOTE_MAKER_SUBMITTED",
          quoteId: input.quoteId,
          quoteNumber: quote.quoteNumber,
          actorId: input.engineerId,
          metadata: { previousStatus: quote.status, newStatus: "MAKER_SUBMITTED" },
        },
      });

      return created;
    });

    return NextResponse.json({ surveyId: survey.id, quoteId: input.quoteId, status: "MAKER_SUBMITTED" });
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[POST /api/maker/survey]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
