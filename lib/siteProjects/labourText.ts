import { formatDate, formatDateTime, formatPKR } from "@/components/siteProjects/shared";
import type { SiteProjectEventType, SiteProjectStatus } from "@/lib/siteProjects/types";

/**
 * Every word the labour head sees on /maker/projects, in English and Urdu.
 * Text that comes from the admin or the server (review notes, scope notes,
 * custom item names, server error messages) is shown as written.
 *
 * Item (SKU) names are never translated: the picker, the saved quotation and
 * the admin all use the catalog's English names.
 */

export type Lang = "en" | "ur";

export interface Dict {
  labourHead: string;
  siteProjects: string;
  survey: string;
  change: string;
  whoAreYou: string;
  selectName: string;
  noLabourHeads: string;
  cancel: string;
  loadingProjects: string;
  noProjects: string;
  /** Banner above the list while the admin has sent offers waiting for an answer. */
  offersWaiting: (n: number) => string;
  groupYourTurn: string;
  groupWithAdmin: string;
  groupFinished: string;
  back: string;
  status: Record<SiteProjectStatus, string>;
  days: (n: number) => string;
  payout: string;
  payoutBreakdown: (materials: string, fee: string) => string;
  paidAfter: string;
  paymentComing: string;
  paidOn: (date: string, ref: string | null) => string;
  readyToStart: string;
  startSite: string;
  notYet: string;
  start: string;
  siteRunning: string;
  since: (dateTime: string) => string;
  whatWasDone: string;
  whatWasDonePlaceholder: string;
  endSite: string;
  fixQuotation: string;
  cancelled: string;
  materials: string;
  youAsked: string;
  approved: string;
  approvedLine: (qty: string, unit: string, price: string, total: string) => string;
  history: string;
  events: Record<SiteProjectEventType, string>;
  offerForYou: string;
  yourFee: string;
  offerTotal: string;
  youAskedAmount: (amount: string) => string;
  whatShouldChange: string;
  changeButton: string;
  accept: string;
  send: string;
  resubmit: string;
  askedLine: (qty: string, unit: string, price: string, offerQty: string, offerPrice: string) => string;
  yourQuotation: string;
  item: (n: number) => string;
  chooseItem: string;
  otherOption: string;
  itemName: string;
  qty: string;
  unit: string;
  rsEach: string;
  addItem: string;
  addOther: string;
  yourFeeRs: string;
  total: string;
  issueChooseItem: string;
  issueQty: string;
  issuePrice: string;
  itemIssue: (n: number, message: string) => string;
  removeItem: (n: number) => string;
  errNetwork: string;
  errTeamNetwork: string;
  errTeam: string;
  errProjects: string;
  errSite: string;
  errAnswer: string;
  errSend: string;
}

const en: Dict = {
  labourHead: "Labour Head",
  siteProjects: "Site Projects",
  survey: "Survey",
  change: "Change",
  whoAreYou: "Who are you?",
  selectName: "Select your name…",
  noLabourHeads: "No labour heads are set up yet. Ask the admin to add you under Team.",
  cancel: "Cancel",
  loadingProjects: "Loading your projects",
  noProjects: "No projects yet",
  offersWaiting: (n) => (n === 1 ? "1 offer is waiting for your answer" : `${n} offers are waiting for your answer`),
  groupYourTurn: "Your turn",
  groupWithAdmin: "With the admin",
  groupFinished: "Finished",
  back: "Back",
  status: {
    ASSIGNED: "Send quotation",
    REVISION_REQUESTED: "Fix quotation",
    COUNTER_OFFERED: "Offer for you",
    APPROVED: "Start site",
    IN_PROGRESS: "Site running",
    SUBMITTED: "Waiting for approval",
    COMPLETED: "Payment coming",
    PAID: "Paid",
    REJECTED: "Cancelled",
  },
  days: (n) => `${n} days`,
  payout: "Your payout",
  payoutBreakdown: (m, f) => `Materials ${m} + your fee ${f}`,
  paidAfter: "Paid after the site ends.",
  paymentComing: "Payment coming.",
  paidOn: (d, ref) => `Paid ${d}${ref ? ` · Ref ${ref}` : ""}`,
  readyToStart: "Ready to start",
  startSite: "Start site",
  notYet: "Not yet",
  start: "Start",
  siteRunning: "Site running",
  since: (dt) => `Since ${dt}`,
  whatWasDone: "What was done",
  whatWasDonePlaceholder: "What was done on site",
  endSite: "End site",
  fixQuotation: "Fix your quotation",
  cancelled: "Cancelled",
  materials: "Materials",
  youAsked: "You asked",
  approved: "Approved",
  approvedLine: (q, u, p, t) => `Approved: ${q} ${u} × ${p} = ${t}`,
  history: "History",
  events: {
    CREATED: "Project created",
    SUBMITTED: "Quotation submitted for approval",
    REVISION_REQUESTED: "Changes requested",
    RESUBMITTED: "Resubmitted",
    COUNTER_OFFERED: "Counter-offer sent",
    ACCEPTED: "Offer accepted, prices fixed",
    DECLINED: "Offer declined",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    STARTED: "Site started",
    COMPLETED: "Site ended",
    PAID: "Payout released",
  },
  offerForYou: "Offer for you",
  yourFee: "Your fee",
  offerTotal: "Offer total",
  youAskedAmount: (a) => `You asked ${a}`,
  whatShouldChange: "What should change?",
  changeButton: "Change",
  accept: "Accept",
  send: "Send",
  resubmit: "Resubmit",
  askedLine: (q, u, p, oq, op) => `You asked ${q} ${u} × ${p}. Offer: ${oq} ${u} × ${op}`,
  yourQuotation: "Your quotation",
  item: (n) => `Item ${n}`,
  chooseItem: "Choose an item…",
  otherOption: "Other (type the name)",
  itemName: "Item name",
  qty: "Qty",
  unit: "Unit",
  rsEach: "Rs each",
  addItem: "Item",
  addOther: "Other",
  yourFeeRs: "Your fee (Rs)",
  total: "Total",
  issueChooseItem: "Choose an item",
  issueQty: "Enter a quantity",
  issuePrice: "Enter the price",
  itemIssue: (n, m) => `Item ${n}: ${m}.`,
  removeItem: (n) => `Remove item ${n}`,
  errNetwork: "Network error. Check your connection and try again.",
  errTeamNetwork: "Network error loading the team list.",
  errTeam: "Could not load the team list.",
  errProjects: "Could not load your projects.",
  errSite: "Could not update the site.",
  errAnswer: "Could not send your answer.",
  errSend: "Could not send the materials.",
};

const ur: Dict = {
  labourHead: "لیبر ہیڈ",
  siteProjects: "سائٹ پروجیکٹس",
  survey: "سروے",
  change: "بدلیں",
  whoAreYou: "آپ کون ہیں؟",
  selectName: "اپنا نام چنیں…",
  noLabourHeads: "ابھی کوئی لیبر ہیڈ شامل نہیں ہے۔ ایڈمن سے کہیں کہ آپ کو ٹیم میں شامل کرے۔",
  cancel: "منسوخ کریں",
  loadingProjects: "پروجیکٹس لوڈ ہو رہے ہیں",
  noProjects: "ابھی کوئی پروجیکٹ نہیں",
  offersWaiting: (n) => (n === 1 ? "1 آفر آپ کے جواب کی منتظر ہے" : `${n} آفرز آپ کے جواب کی منتظر ہیں`),
  groupYourTurn: "آپ کی باری",
  groupWithAdmin: "ایڈمن کے پاس",
  groupFinished: "مکمل شدہ",
  back: "واپس",
  status: {
    ASSIGNED: "کوٹیشن بھیجیں",
    REVISION_REQUESTED: "کوٹیشن درست کریں",
    COUNTER_OFFERED: "آپ کے لیے آفر",
    APPROVED: "سائٹ شروع کریں",
    IN_PROGRESS: "سائٹ چل رہی ہے",
    SUBMITTED: "منظوری کا انتظار",
    COMPLETED: "ادائیگی آنے والی ہے",
    PAID: "ادا ہو گیا",
    REJECTED: "منسوخ",
  },
  days: (n) => `${n} دن`,
  payout: "آپ کی ادائیگی",
  payoutBreakdown: (m, f) => `سامان ${m} + آپ کی فیس ${f}`,
  paidAfter: "سائٹ ختم ہونے کے بعد ادائیگی ہوگی۔",
  paymentComing: "ادائیگی آنے والی ہے۔",
  paidOn: (d, ref) => `ادا ہوا ${d}${ref ? ` · حوالہ ${ref}` : ""}`,
  readyToStart: "شروع کرنے کے لیے تیار",
  startSite: "سائٹ شروع کریں",
  notYet: "ابھی نہیں",
  start: "شروع کریں",
  siteRunning: "سائٹ چل رہی ہے",
  since: (dt) => `${dt} سے`,
  whatWasDone: "کیا کام ہوا",
  whatWasDonePlaceholder: "سائٹ پر کیا کام ہوا",
  endSite: "سائٹ ختم کریں",
  fixQuotation: "اپنی کوٹیشن درست کریں",
  cancelled: "منسوخ",
  materials: "سامان",
  youAsked: "آپ نے مانگا",
  approved: "منظور شدہ",
  approvedLine: (q, u, p, t) => `منظور: ${q} ${u} × ${p} = ${t}`,
  history: "ریکارڈ",
  events: {
    CREATED: "پروجیکٹ بنایا گیا",
    SUBMITTED: "کوٹیشن منظوری کے لیے بھیجی گئی",
    REVISION_REQUESTED: "تبدیلی کا کہا گیا",
    RESUBMITTED: "دوبارہ بھیجی گئی",
    COUNTER_OFFERED: "نئی آفر بھیجی گئی",
    ACCEPTED: "آفر قبول، قیمتیں طے",
    DECLINED: "آفر مسترد",
    APPROVED: "منظور",
    REJECTED: "مسترد",
    STARTED: "سائٹ شروع ہوئی",
    COMPLETED: "سائٹ ختم ہوئی",
    PAID: "ادائیگی جاری ہوئی",
  },
  offerForYou: "آپ کے لیے آفر",
  yourFee: "آپ کی فیس",
  offerTotal: "آفر کی کل رقم",
  youAskedAmount: (a) => `آپ نے مانگا ${a}`,
  whatShouldChange: "کیا بدلنا چاہیے؟",
  changeButton: "تبدیلی",
  accept: "قبول کریں",
  send: "بھیجیں",
  resubmit: "دوبارہ بھیجیں",
  askedLine: (q, u, p, oq, op) => `آپ نے مانگا ${q} ${u} × ${p}۔ آفر: ${oq} ${u} × ${op}`,
  yourQuotation: "آپ کی کوٹیشن",
  item: (n) => `آئٹم ${n}`,
  chooseItem: "آئٹم چنیں…",
  otherOption: "دیگر (نام لکھیں)",
  itemName: "آئٹم کا نام",
  qty: "تعداد",
  unit: "یونٹ",
  rsEach: "فی یونٹ روپے",
  addItem: "آئٹم",
  addOther: "دیگر",
  yourFeeRs: "آپ کی فیس (روپے)",
  total: "کل",
  issueChooseItem: "آئٹم چنیں",
  issueQty: "تعداد لکھیں",
  issuePrice: "قیمت لکھیں",
  itemIssue: (n, m) => `آئٹم ${n}: ${m}۔`,
  removeItem: (n) => `آئٹم ${n} ہٹائیں`,
  errNetwork: "نیٹ ورک کا مسئلہ۔ انٹرنیٹ چیک کریں اور دوبارہ کوشش کریں۔",
  errTeamNetwork: "ٹیم کی فہرست لوڈ نہیں ہوئی۔ انٹرنیٹ چیک کریں۔",
  errTeam: "ٹیم کی فہرست لوڈ نہیں ہو سکی۔",
  errProjects: "آپ کے پروجیکٹس لوڈ نہیں ہو سکے۔",
  errSite: "سائٹ اپ ڈیٹ نہیں ہو سکی۔",
  errAnswer: "آپ کا جواب نہیں بھیجا جا سکا۔",
  errSend: "کوٹیشن نہیں بھیجی جا سکی۔",
};

export const TEXT: Record<Lang, Dict> = { en, ur };

/** Dates keep Western digits in Urdu, as people in Pakistan write them. */
const LOCALE: Record<Lang, string> = { en: "en-PK", ur: "ur-PK-u-nu-latn" };

export function moneyText(lang: Lang, n: number): string {
  if (lang === "en") return formatPKR(n);
  return `${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n)} روپے`;
}

export const dateText = (lang: Lang, iso: string) => formatDate(iso, LOCALE[lang]);
// Urdu uses the 24-hour clock so "4:39 PM" never gets split up by the right-to-left text.
export const dateTimeText = (lang: Lang, iso: string) =>
  lang === "ur"
    ? new Date(iso).toLocaleString(LOCALE.ur, { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" })
    : formatDateTime(iso, LOCALE.en);

/** A picker entry reads "group · item" so two items with the same name stay apart. Always English, as in the catalog. */
export function catalogEntryLabel(group: { label: string }, item: { label: string }): string {
  return `${group.label} · ${item.label}`;
}
