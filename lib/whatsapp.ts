/**
 * Shared WhatsApp deep-link helpers. No API keys involved — this builds
 * plain wa.me links a human clicks to open a prefilled chat and hits
 * send themselves. That's the deliberate stand-in for the real Wati/
 * Make.com dispatch integration named in the original tech stack; swap
 * `buildWaLink` callers for a real API dispatch when that's built.
 */

/** Strips everything but digits — wa.me wants country code + number, no "+". */
export function normalizePhoneForWa(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export function buildWaLink(phone: string, message: string): string {
  return `https://wa.me/${normalizePhoneForWa(phone)}?text=${encodeURIComponent(message)}`;
}

const pkrFormatter = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

/** Client-safe, already-marked-up line items for the binding contract —
 *  mirrors AdminBoqPricingResult.markedUpBreakdown (lib/db/admin.ts).
 *  NEVER pass raw/pre-margin figures here — this text goes straight to
 *  the customer over WhatsApp. */
export interface ContractLineItems {
  panelPKR: number;
  inverterPKR: number;
  /** 0 (or omit) for ONGRID_ZERO_EXPORT quotes — filtered out of the
   *  itemized text automatically, same as every other zero/absent line. */
  batteryPKR?: number;
  breakersPKR: number;
  structurePKR: number;
  installationPKR: number;
  dcCablePKR: number;
  acCablePKR: number;
  dataCablePKR: number;
  dbUpgradePKR?: number;
}

export interface ContractMessageInput {
  fullName: string;
  quoteNumber: string;
  systemKw: number;
  finalPriceRs: number;
  daysToDeploy: number;
  lineItems: ContractLineItems;
}

/** The binding-contract WhatsApp message the Checker dispatches to the
 *  client on approval. Manual click-to-send today — swap for a Wati/
 *  Make.com API call when that integration lands (see lib/whatsapp.ts
 *  module doc). Explicitly itemizes every component — including
 *  "Installation & Commissioning" — so the contract is transparent about
 *  what the final price covers, not just one lump-sum figure. */
export function buildContractMessage(input: ContractMessageInput): string {
  const { fullName, quoteNumber, systemKw, finalPriceRs, daysToDeploy, lineItems } = input;

  const lines: [string, number | undefined][] = [
    ["Solar Panels", lineItems.panelPKR],
    ["Inverter", lineItems.inverterPKR],
    ["Battery", lineItems.batteryPKR],
    ["Protection & Breakers", lineItems.breakersPKR],
    ["Structure & Mounting", lineItems.structurePKR],
    ["Cabling & Metering", (lineItems.dcCablePKR ?? 0) + (lineItems.acCablePKR ?? 0) + (lineItems.dataCablePKR ?? 0)],
    ["DB Panel Upgrade", lineItems.dbUpgradePKR],
    ["Installation & Commissioning", lineItems.installationPKR],
  ];
  const itemizedText = lines
    .filter((line): line is [string, number] => typeof line[1] === "number" && line[1] > 0)
    .map(([label, pkr]) => `• ${label}: ${pkrFormatter.format(pkr)}`)
    .join("\n");

  return [
    `Hi ${fullName}! Your Solar Pixel system is approved. 🎉`,
    "",
    `Quote: ${quoteNumber}`,
    `System Size: ${systemKw} kW`,
    "",
    "Itemized BOQ:",
    itemizedText,
    "",
    `Final Price: ${pkrFormatter.format(finalPriceRs)}`,
    `Live in: ${daysToDeploy} days from confirmation`,
    "",
    "No WAPDA net-metering paperwork — reply YES to confirm and we'll lock in your installation slot.",
  ].join("\n");
}
