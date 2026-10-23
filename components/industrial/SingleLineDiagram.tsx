import type { ReactNode } from "react";

/**
 * Indicative electrical single line diagram for an industrial quotation.
 * Laid out in zones (solar field, control room, utility grid, standby power,
 * site loads) with colour-coded conductors, but every device is a standard
 * single line symbol: PV array, isolator, SPD, inverter, MCCB / ACB, HT VCB,
 * transformer, kWh meter, ATS, generator, motor, earth. Everything drawn
 * comes from the quote or from what the customer entered; ratings are
 * computed, never invented, and the title block says it is indicative.
 */

export interface SingleLineDiagramProps {
  panelCount: number;
  panelWatt: number | null;
  panelLabel: string;
  inverterLabel: string;
  inverterQuantity: number;
  inverterKwEach: number | null;
  isHT: boolean;
  sanctionedLoadKw: number | null;
  generator: { fuel: "DIESEL" | "GAS" | null; capacityKw: number | null } | null;
  earthingPits: number;
  lightningArresters: number;
  customerName: string;
  reference: string;
  dateLabel: string;
}

// Standard breaker frame ratings (A), used to pick the next size up.
const BREAKER_SIZES = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200];
const nextBreaker = (amps: number) => BREAKER_SIZES.find((s) => s >= amps) ?? Math.ceil(amps / 100) * 100;
const trim = (n: number, digits = 1) => String(Number(n.toFixed(digits)));

const INK = "#0F172A";
const SUB = "#475569";
const DC = "#D97706";
const AC = "#1E293B";
const HV = "#6D28D9";
const W = 1000;

/** White disc a symbol sits on, so the conductor passes "behind" the device. */
function Disc({ x, y, r = 17 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill="#fff" stroke="#CBD5E1" strokeWidth="1" />;
}

/** Circuit breaker on a vertical conductor: slanted blade with the breaking cross. */
function Breaker({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Disc x={x} y={y} />
      <g stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round">
        <line x1={x} y1={y + 11} x2={x - 8} y2={y - 6} />
        <line x1={x - 4} y1={y - 12} x2={x + 4} y2={y - 4} />
        <line x1={x + 4} y1={y - 12} x2={x - 4} y2={y - 4} />
      </g>
    </g>
  );
}

/** Isolator / switch-disconnector on a horizontal conductor. */
function IsolatorH({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <Disc x={x} y={y} />
      <g stroke={color} strokeWidth="2" fill="none" strokeLinecap="round">
        <line x1={x - 11} y1={y} x2={x - 5} y2={y} />
        <line x1={x - 5} y1={y} x2={x + 7} y2={y - 8} />
        <line x1={x + 9} y1={y} x2={x + 11} y2={y} />
      </g>
    </g>
  );
}

function Earth({ x, y, color = INK }: { x: number; y: number; color?: string }) {
  return (
    <g stroke={color} strokeWidth="2" strokeLinecap="round">
      <line x1={x} y1={y} x2={x} y2={y + 9} />
      <line x1={x - 11} y1={y + 9} x2={x + 11} y2={y + 9} />
      <line x1={x - 7} y1={y + 14} x2={x + 7} y2={y + 14} />
      <line x1={x - 3} y1={y + 19} x2={x + 3} y2={y + 19} />
    </g>
  );
}

function Txt({
  x,
  y,
  lines,
  anchor = "start",
  size = 13,
  color = INK,
  bold,
}: {
  x: number;
  y: number;
  lines: ReactNode[];
  anchor?: "start" | "middle" | "end";
  size?: number;
  color?: string;
  bold?: boolean;
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fill={color} fontWeight={bold ? 700 : 500}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : size + 3} fill={i === 0 ? color : SUB} fontWeight={i === 0 && bold ? 700 : 500}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Small tag naming a zone, drawn on its top edge. */
function ZoneTag({ x, y, text, fill, color }: { x: number; y: number; text: string; fill: string; color: string }) {
  const w = text.length * 7.4 + 22;
  return (
    <g>
      <rect x={x} y={y - 12} width={w} height="24" rx="12" fill={fill} />
      <text x={x + w / 2} y={y + 4.5} textAnchor="middle" fontSize="11.5" fontWeight="800" letterSpacing="1.2" fill={color}>
        {text}
      </text>
    </g>
  );
}

export function SingleLineDiagram(p: SingleLineDiagramProps) {
  const arrayKwp = p.panelWatt ? (p.panelCount * p.panelWatt) / 1000 : null;
  const singlePhase = /single phase/i.test(p.inverterLabel);
  const acKw = p.inverterKwEach ? p.inverterKwEach * p.inverterQuantity : null;
  const volts = singlePhase ? 230 : 400;
  const acAmps = acKw ? (acKw * 1000) / (singlePhase ? volts : Math.sqrt(3) * volts) : null;
  const inverterBreaker = acAmps ? nextBreaker(acAmps * 1.25) : null;
  const incomerAmps = p.sanctionedLoadKw ? (p.sanctionedLoadKw * 1000) / (Math.sqrt(3) * 400 * 0.9) : null;
  const incomer = incomerAmps ? nextBreaker(incomerAmps * 1.1) : null;
  const gen = p.generator;
  const fuel = gen?.fuel === "GAS" ? "Gas" : gen?.fuel === "DIESEL" ? "Diesel" : "";

  const busY = 340;
  const chainX = 770;
  const feederX = 650;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm print:overflow-visible print:shadow-none">
      <svg
        viewBox={`0 0 ${W} 720`}
        role="img"
        aria-label="Electrical single line diagram of the proposed solar plant"
        className="h-auto w-full min-w-[720px] print:min-w-0"
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
      >
        <defs>
          <pattern id="sldDots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#E2E8F0" />
          </pattern>
          <linearGradient id="sldBus" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#64748B" />
            <stop offset="100%" stopColor="#1E293B" />
          </linearGradient>
          <linearGradient id="sldInverter" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1E3A5F" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>
        </defs>

        <rect width={W} height="720" fill="#fff" />
        <rect width={W} height="720" fill="url(#sldDots)" />

        {/* ======================= ZONES ======================= */}
        <rect x="24" y="30" width="290" height="262" rx="18" fill="#FFFBEB" stroke="#FCD34D" strokeWidth="1.5" />
        <rect x="334" y="30" width="270" height="262" rx="18" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="1.5" />
        <rect x="684" y="30" width="292" height="262" rx="18" fill="#FCE8E9" stroke="#F7BBBD" strokeWidth="1.5" />
        <ZoneTag x={42} y={30} text="SOLAR FIELD" fill="#D97706" color="#fff" />
        <ZoneTag x={352} y={30} text="CONTROL ROOM" fill="#334155" color="#fff" />
        <ZoneTag x={702} y={30} text="UTILITY SUPPLY" fill="#C2474C" color="#fff" />
        {gen && (
          <>
            <rect x="24" y="420" width="290" height="236" rx="18" fill="#FFF7ED" stroke="#FDBA74" strokeWidth="1.5" />
            <ZoneTag x={42} y={420} text="STANDBY POWER" fill="#EA580C" color="#fff" />
          </>
        )}
        <rect x="334" y="420" width="642" height="236" rx="18" fill="#F0FDF4" stroke="#86EFAC" strokeWidth="1.5" />
        <ZoneTag x={352} y={420} text="SITE LOADS" fill="#15803D" color="#fff" />

        {/* ======================= SOLAR FIELD ======================= */}
        <rect x="52" y="64" width="234" height="96" rx="10" fill="#fff" stroke={DC} strokeWidth="2" />
        {[0, 1, 2, 3].map((c) =>
          [0, 1].map((r) => (
            <rect key={`${c}-${r}`} x={62 + c * 55} y={74 + r * 38} width="49" height="32" rx="3" fill="#FEF3C7" stroke={DC} strokeWidth="1.2" />
          )),
        )}
        <Txt
          x={169}
          y={184}
          anchor="middle"
          bold
          size={15}
          lines={[
            `${p.panelCount} x ${p.panelWatt ? `${p.panelWatt} Wp` : "panels"}${arrayKwp ? `  =  ${trim(arrayKwp, 1)} kWp` : ""}`,
            p.panelLabel,
          ]}
        />

        {/* DC run: PV -> isolator -> inverter, with the SPD to earth */}
        <path d="M169 160 V 242 H 380" fill="none" stroke={DC} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
        <IsolatorH x={230} y={242} color={DC} />
        <Txt x={230} y={272} anchor="middle" size={11.5} lines={["DC isolator"]} />
        <line x1="290" y1="242" x2="290" y2="251" stroke={DC} strokeWidth="2.5" />
        <rect x="284" y="251" width="12" height="11" fill="#fff" stroke={DC} strokeWidth="2" />
        <Txt x={140} y={236} anchor="middle" size={11.5} color={DC} bold lines={["DC +/-"]} />

        {/* Lightning protection tag */}
        <g>
          <path d="M166 46 L172 34 L178 46 Z" fill="none" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
          <line x1="172" y1="46" x2="172" y2="58" stroke={INK} strokeWidth="1.8" />
        </g>
        <Txt
          x={186}
          y={52}
          size={11}
          color={SUB}
          lines={[p.lightningArresters > 0 ? `Lightning arrestor x ${p.lightningArresters}` : "Lightning protection"]}
        />

        {/* ======================= INVERTER ======================= */}
        <rect x="380" y="82" width="170" height="190" rx="14" fill="url(#sldInverter)" />
        <line x1="396" y1="256" x2="534" y2="104" stroke="#94A3B8" strokeWidth="2" />
        <text x="404" y="128" fontSize="28" fontWeight="700" fill="#34D399">=</text>
        <text x="508" y="246" fontSize="28" fontWeight="700" fill="#34D399">~</text>
        <Txt
          x={465}
          y={306}
          anchor="middle"
          bold
          size={15}
          lines={[
            p.inverterQuantity > 1 && p.inverterKwEach && acKw
              ? `${p.inverterQuantity} x ${trim(p.inverterKwEach)} kW  =  ${trim(acKw)} kW AC`
              : acKw
                ? `${trim(acKw)} kW AC`
                : "Inverter",
          ]}
        />
        <Txt x={465} y={328} anchor="middle" size={11.5} color={SUB} lines={[`${singlePhase ? "1" : "3"}Ph ${volts} V  |  ${p.inverterLabel}`]} />
        <Earth x={290} y={262} color={DC} />
        <Txt x={310} y={284} size={11.5} color={SUB} lines={[p.earthingPits > 0 ? `Earth pits x ${p.earthingPits}` : "Earthing"]} />
        <Txt x={304} y={262} size={11.5} color={DC} bold lines={["DC SPD"]} />

        {/* AC out -> MCCB -> main LT bus */}
        <path d={`M550 150 H 596 V ${busY}`} fill="none" stroke={AC} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
        <Breaker x={596} y={290} />
        <Txt
          x={614}
          y={282}
          size={12.5}
          bold
          lines={["AC MCCB", inverterBreaker ? `${inverterBreaker} A (indicative)` : "to inverter rating"]}
        />

        {/* ======================= MAIN LT BUS ======================= */}
        <line x1="60" y1={busY} x2="940" y2={busY} stroke="url(#sldBus)" strokeWidth="10" strokeLinecap="round" />
        <circle cx="596" cy={busY} r="5" fill={AC} />
        <rect x="100" y={busY + 14} width="300" height="24" rx="12" fill="#1E293B" />
        <text x="250" y={busY + 30.5} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" letterSpacing="0.6">
          MAIN LT BOARD  |  400 V  3Ph  4W  50 Hz
        </text>
        <Earth x={76} y={busY + 5} />

        {/* ======================= UTILITY SUPPLY ======================= */}
        <circle cx={chainX} cy="78" r="20" fill="#fff" stroke={HV} strokeWidth="2.5" />
        <text x={chainX} y="85" textAnchor="middle" fontSize="22" fill={HV}>~</text>
        <Txt x={chainX + 34} y={74} bold size={14} lines={["LESCO / WAPDA", p.isHT ? "11 kV  3Ph  50 Hz" : "400 V  3Ph  50 Hz"]} />
        {p.isHT ? (
          <>
            <path d={`M${chainX} 98 V 160`} fill="none" stroke={HV} strokeWidth="3.5" strokeLinecap="round" />
            <path d={`M${chainX} 228 V ${busY}`} fill="none" stroke={AC} strokeWidth="3.5" strokeLinecap="round" />
            <Breaker x={chainX} y={132} />
            <Txt x={chainX + 28} y={128} size={12.5} bold lines={["HT VCB", "11 kV"]} />
            <path d={`M${chainX} 160 V 173`} fill="none" stroke={HV} strokeWidth="3.5" strokeLinecap="round" />
            <circle cx={chainX} cy="190" r="17" fill="#fff" stroke={INK} strokeWidth="2.2" />
            <circle cx={chainX} cy="212" r="17" fill="#fff" stroke={INK} strokeWidth="2.2" />
            <Txt x={chainX + 30} y={196} size={12.5} bold lines={["Transformer", "11 / 0.4 kV"]} />
            <Disc x={chainX} y={256} r={18} />
            <circle cx={chainX} cy="256" r="14" fill="#fff" stroke={INK} strokeWidth="2.2" />
            <text x={chainX} y="261" textAnchor="middle" fontSize="12" fontWeight="700" fill={INK}>kWh</text>
            <Txt x={chainX + 30} y={260} size={12.5} bold lines={["LESCO meter"]} />
            <Breaker x={chainX} y={310} />
            <Txt x={chainX + 28} y={306} size={12.5} bold lines={["Main incomer", incomer ? `ACB ${incomer} A` : "ACB per sanctioned load"]} />
          </>
        ) : (
          <>
            <path d={`M${chainX} 98 V ${busY}`} fill="none" stroke={AC} strokeWidth="3.5" strokeLinecap="round" />
            <Disc x={chainX} y={170} r={18} />
            <circle cx={chainX} cy="170" r="14" fill="#fff" stroke={INK} strokeWidth="2.2" />
            <text x={chainX} y="175" textAnchor="middle" fontSize="12" fontWeight="700" fill={INK}>kWh</text>
            <Txt x={chainX + 30} y={174} size={12.5} bold lines={["LESCO meter"]} />
            <Breaker x={chainX} y={254} />
            <Txt x={chainX + 28} y={250} size={12.5} bold lines={["Main incomer", incomer ? `MCCB / ACB ${incomer} A` : "per sanctioned load"]} />
          </>
        )}

        {/* ======================= STANDBY GENERATOR ======================= */}
        {gen && (
          <g>
            <path d={`M169 ${busY} V 556`} fill="none" stroke={AC} strokeWidth="3.5" strokeLinecap="round" />
            <rect x="124" y="456" width="90" height="56" rx="10" fill="#fff" stroke="#EA580C" strokeWidth="2.2" />
            <text x="169" y="491" textAnchor="middle" fontSize="18" fontWeight="800" fill="#EA580C">ATS</text>
            <Txt x={228} y={474} size={12.5} bold lines={["Auto changeover", "interlocked with grid"]} />
            <circle cx="169" cy="580" r="24" fill="#fff" stroke={INK} strokeWidth="2.4" />
            <text x="169" y="587" textAnchor="middle" fontSize="20" fontWeight="800" fill={INK}>G</text>
            <Txt
              x={204}
              y={618}
              size={13}
              bold
              anchor="middle"
              lines={[`${fuel ? `${fuel} generator` : "Generator"}${gen.capacityKw ? `  ${trim(gen.capacityKw)} kW standby` : ""}`]}
            />
          </g>
        )}

        {/* ======================= SITE LOADS ======================= */}
        <path d={`M${feederX} ${busY} V 480`} fill="none" stroke={AC} strokeWidth="3.5" strokeLinecap="round" />
        <Breaker x={feederX} y={392} />
        <Txt x={feederX + 22} y={388} size={12.5} bold lines={["Feeder MCCB", "to factory loads"]} />
        <rect x="366" y="480" width="578" height="152" rx="14" fill="#fff" stroke="#86EFAC" strokeWidth="2" />
        <Txt x={655} y={508} anchor="middle" bold size={15} color="#166534" lines={["FACTORY LOADS"]} />
        {["M", "M", "M", "M", "L"].map((tag, i) => {
          const cx = 440 + i * 108;
          return (
            <g key={i}>
              <line x1={cx} y1="518" x2={cx} y2="548" stroke={AC} strokeWidth="2.5" />
              <circle cx={cx} cy="570" r="22" fill="#fff" stroke={INK} strokeWidth="2.2" />
              <text x={cx} y="577" textAnchor="middle" fontSize="19" fontWeight="800" fill={INK}>{tag}</text>
            </g>
          );
        })}
        <Txt
          x={655}
          y={620}
          anchor="middle"
          size={12.5}
          color={SUB}
          lines={[p.sanctionedLoadKw ? `Sanctioned load ${trim(p.sanctionedLoadKw, 0)} kW  |  motors, lighting, offices` : "Motors, lighting, offices"]}
        />

        {/* ======================= LEGEND + TITLE BLOCK ======================= */}
        <rect x="24" y="672" width="952" height="38" rx="10" fill="#F8FAFC" stroke="#CBD5E1" />
        <g fontSize="11.5" fill={INK} fontWeight="600">
          <line x1="40" y1="691" x2="68" y2="691" stroke={DC} strokeWidth="3.5" strokeLinecap="round" />
          <text x="76" y="695">DC</text>
          <line x1="108" y1="691" x2="136" y2="691" stroke={AC} strokeWidth="3.5" strokeLinecap="round" />
          <text x="144" y="695">AC 400 V</text>
          <line x1="216" y1="691" x2="244" y2="691" stroke={HV} strokeWidth="3.5" strokeLinecap="round" />
          <text x="252" y="695">HT 11 kV</text>
        </g>
        <g fontSize="11.5" fill={INK}>
          <text x="368" y="695" fontWeight="800">SINGLE LINE DIAGRAM</text>
          <text x="530" y="695" fill={SUB}>Client</text>
          <text x="570" y="695" fontWeight="700">{p.customerName || "Customer"}</text>
          <text x="720" y="695" fill={SUB}>Ref</text>
          <text x="745" y="695" fontWeight="700">{p.reference}</text>
          <text x="850" y="695" fill={SUB}>Date</text>
          <text x="880" y="695" fontWeight="700">{p.dateLabel}</text>
        </g>
      </svg>
      <p className="border-t border-slate-200 px-4 py-2.5 text-[10.5px] leading-relaxed text-slate-500">
        Indicative, not for construction. Breaker ratings are the next standard frame at 1.25 times the inverter&apos;s AC current (
        {singlePhase ? "230 V single phase" : "400 V three phase"}); the incomer is sized from the sanctioned load if given. Cable sizes, protection
        settings, transformer rating and earthing resistance are fixed in the final design after the site survey, to NEPRA and IEC 60364 requirements.
      </p>
    </div>
  );
}
