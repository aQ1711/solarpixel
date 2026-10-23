/**
 * Indicative electrical single line diagram for an industrial quotation.
 * An engineering sheet (frame, grid references, title block, tagged devices
 * on standard IEC symbols, equipment schedule beneath) with richer graphics:
 * an illustrated PV array, a solid-state inverter, coloured conductors and
 * softly tinted areas for generation, utility, standby and loads. Only
 * devices that are really in the quote are drawn, and every rating is
 * computed from the quote's own numbers, never invented.
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
const AC = "#0F3D6E";
const HV = "#6D28D9";
const W = 1000;
const H = 700;

/** White gap behind a device so the conductor appears to pass through it. */
function Gap({ x, y, w = 32, h = 36 }: { x: number; y: number; w?: number; h?: number }) {
  return <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill="#fff" rx="6" />;
}

/** Circuit breaker on a vertical conductor: blade plus the breaking cross. */
function Breaker({ x, y, color = INK }: { x: number; y: number; color?: string }) {
  return (
    <g>
      <Gap x={x} y={y} />
      <g stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round">
        <line x1={x} y1={y - 18} x2={x} y2={y - 10} />
        <line x1={x} y1={y + 10} x2={x} y2={y + 18} />
        <line x1={x} y1={y + 10} x2={x - 10} y2={y - 9} />
        <line x1={x - 4} y1={y - 16} x2={x + 4} y2={y - 8} />
        <line x1={x + 4} y1={y - 16} x2={x - 4} y2={y - 8} />
      </g>
    </g>
  );
}

/** Isolator on a horizontal conductor. */
function IsolatorH({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <Gap x={x} y={y} w={38} h={28} />
      <g stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round">
        <line x1={x - 19} y1={y} x2={x - 9} y2={y} />
        <line x1={x - 9} y1={y} x2={x + 9} y2={y - 12} />
        <line x1={x + 11} y1={y} x2={x + 19} y2={y} />
      </g>
    </g>
  );
}

function Earth({ x, y, color = INK }: { x: number; y: number; color?: string }) {
  return (
    <g stroke={color} strokeWidth="2.4" strokeLinecap="round">
      <line x1={x} y1={y} x2={x} y2={y + 10} />
      <line x1={x - 13} y1={y + 10} x2={x + 13} y2={y + 10} />
      <line x1={x - 9} y1={y + 16} x2={x + 9} y2={y + 16} />
      <line x1={x - 5} y1={y + 22} x2={x + 5} y2={y + 22} />
    </g>
  );
}

/** Device tag (PV1, QA1...) with an optional one-line rating next to it. */
function Tag({
  x,
  y,
  tag,
  rating,
  anchor = "start",
}: {
  x: number;
  y: number;
  tag: string;
  rating?: string;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize="16" fontWeight="800" fill={INK}>
      {tag}
      {rating && (
        <tspan fontWeight="600" fill={SUB} fontSize="14" dx="7">
          {rating}
        </tspan>
      )}
    </text>
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
  const inverterText =
    p.inverterQuantity > 1 && p.inverterKwEach && acKw
      ? `${p.inverterQuantity} x ${trim(p.inverterKwEach)} kW = ${trim(acKw)} kW`
      : acKw
        ? `${trim(acKw)} kW`
        : "Inverter";

  const busY = 396;
  const chainX = 862;
  const feederX = 640;

  // Equipment schedule: one row per device that is actually drawn.
  const schedule: { tag: string; item: string; detail: string }[] = [
    {
      tag: "PV1",
      item: "PV array",
      detail: `${p.panelCount} x ${p.panelWatt ? `${p.panelWatt} Wp` : "panels"}${arrayKwp ? ` = ${trim(arrayKwp, 1)} kWp` : ""}, ${p.panelLabel}`,
    },
    { tag: "QD1", item: "DC isolator and DC SPD", detail: "Rated to the array voltage and current in the final design" },
    {
      tag: "INV1",
      item: "Inverter",
      detail: `${inverterText} AC, ${singlePhase ? "1" : "3"}Ph ${volts} V, ${p.inverterLabel}`,
    },
    {
      tag: "QA1",
      item: "Inverter AC breaker (MCCB)",
      detail: inverterBreaker ? `${inverterBreaker} A, next standard frame above 1.25 x ${trim(acAmps ?? 0, 0)} A` : "Rated to the inverter output",
    },
    {
      tag: "Q1",
      item: "Main incomer",
      detail: incomer ? `${p.isHT ? "ACB" : "MCCB / ACB"} ${incomer} A, from ${trim(p.sanctionedLoadKw ?? 0, 0)} kW sanctioned load` : "Sized to the sanctioned load",
    },
    { tag: "M1", item: "Energy meter", detail: "LESCO / WAPDA kWh meter" },
    ...(p.isHT
      ? [
          { tag: "T1", item: "Transformer", detail: "11 / 0.4 kV, kVA rating per site and LESCO requirements" },
          { tag: "QH1", item: "HT circuit breaker", detail: "11 kV vacuum circuit breaker (VCB)" },
        ]
      : []),
    ...(gen
      ? [
          { tag: "G1", item: `${fuel ? `${fuel} generator` : "Generator"}`, detail: `${gen.capacityKw ? `${trim(gen.capacityKw)} kW, ` : ""}standby supply` },
          { tag: "ATS1", item: "Automatic transfer switch", detail: "Interlocked so the generator and grid can never feed the board together" },
        ]
      : []),
    { tag: "QF1", item: "Factory feeder breaker", detail: "MCCB to the factory loads" },
    {
      tag: "E1",
      item: "Earthing",
      detail: `${p.earthingPits > 0 ? `${p.earthingPits} earth pits` : "Earth pits"} to IEC 60364${p.lightningArresters > 0 ? `, ${p.lightningArresters} lightning arrestor${p.lightningArresters > 1 ? "s" : ""} (LA1)` : ""}`,
    },
  ];

  const colLabels = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const rowLabels = ["A", "B", "C", "D"];

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white print:overflow-visible">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Electrical single line diagram of the proposed solar plant"
        className="h-auto w-full min-w-[720px] print:min-w-0"
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
      >
        <defs>
          <linearGradient id="sldCell" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1E3A8A" />
          </linearGradient>
          <linearGradient id="sldInv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>
          <linearGradient id="sldGen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FDBA74" />
            <stop offset="100%" stopColor="#EA580C" />
          </linearGradient>
          <linearGradient id="sldMotor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="#fff" />

        {/* ---------- Sheet frame with grid references ---------- */}
        <rect x="8" y="8" width={W - 16} height={H - 16} fill="none" stroke={INK} strokeWidth="2.4" />
        <rect x="30" y="30" width={W - 60} height={H - 60} fill="none" stroke={INK} strokeWidth="1" />
        {colLabels.map((c, i) => {
          const x = 30 + ((W - 60) / 8) * (i + 0.5);
          const edge = 30 + ((W - 60) / 8) * i;
          return (
            <g key={c}>
              <text x={x} y="24" textAnchor="middle" fontSize="12" fill={SUB}>{c}</text>
              <text x={x} y={H - 13} textAnchor="middle" fontSize="12" fill={SUB}>{c}</text>
              {i > 0 && <line x1={edge} y1="8" x2={edge} y2="30" stroke={INK} strokeWidth="1" />}
              {i > 0 && <line x1={edge} y1={H - 30} x2={edge} y2={H - 8} stroke={INK} strokeWidth="1" />}
            </g>
          );
        })}
        {rowLabels.map((r, i) => {
          const y = 30 + ((H - 60) / 4) * (i + 0.5);
          const edge = 30 + ((H - 60) / 4) * i;
          return (
            <g key={r}>
              <text x="19" y={y + 4} textAnchor="middle" fontSize="12" fill={SUB}>{r}</text>
              <text x={W - 19} y={y + 4} textAnchor="middle" fontSize="12" fill={SUB}>{r}</text>
              {i > 0 && <line x1="8" y1={edge} x2="30" y2={edge} stroke={INK} strokeWidth="1" />}
              {i > 0 && <line x1={W - 30} y1={edge} x2={W - 8} y2={edge} stroke={INK} strokeWidth="1" />}
            </g>
          );
        })}

        {/* ---------- Softly tinted areas ---------- */}
        <rect x="44" y="46" width="610" height="262" rx="14" fill="#FFFBEB" />
        <rect x="684" y="46" width="272" height="338" rx="14" fill="#F5F3FF" />
        <rect x="320" y="440" width="636" height="190" rx="14" fill="#F0FDF4" />
        {gen && <rect x="44" y="440" width="256" height="190" rx="14" fill="#FFF7ED" />}
        <g fontSize="11.5" fontWeight="800" letterSpacing="1.4" fill="#94A3B8">
          <text x="58" y="66">GENERATION</text>
          <text x="698" y="66">UTILITY SUPPLY</text>
          <text x="334" y="460">SITE LOADS</text>
          {gen && <text x="58" y="460">STANDBY POWER</text>}
        </g>

        {/* ---------- PV array (illustrated) ---------- */}
        <g>
          <circle cx="68" cy="102" r="10" fill="#FBBF24" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line
              key={a}
              x1={68 + Math.cos((a * Math.PI) / 180) * 14}
              y1={102 + Math.sin((a * Math.PI) / 180) * 14}
              x2={68 + Math.cos((a * Math.PI) / 180) * 19}
              y2={102 + Math.sin((a * Math.PI) / 180) * 19}
              stroke="#FBBF24"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          ))}
          <g transform="skewX(-10)">
            <rect x="124" y="104" width="206" height="124" rx="4" fill="#CBD5E1" stroke={DC} strokeWidth="2.4" />
            {[0, 1, 2, 3, 4].map((c) =>
              [0, 1, 2].map((r) => (
                <rect key={`${c}-${r}`} x={130 + c * 40} y={110 + r * 38} width="36" height="34" rx="2" fill="url(#sldCell)" />
              )),
            )}
            {[1, 2, 3, 4].map((c) => (
              <line key={c} x1={130 + c * 40 - 2} y1="110" x2={130 + c * 40 - 2} y2="224" stroke="#93C5FD" strokeWidth="0.8" />
            ))}
          </g>
          <line x1="140" y1="228" x2="132" y2="248" stroke={INK} strokeWidth="3" />
          <line x1="262" y1="228" x2="254" y2="248" stroke={INK} strokeWidth="3" />
          <text x="150" y="88" fontSize="16" fontWeight="800" fill={INK}>
            PV1
            <tspan fontWeight="600" fill={SUB} fontSize="14" dx="7">
              {p.panelCount} x {p.panelWatt ? `${p.panelWatt} Wp` : "panels"}
            </tspan>
          </text>
          {arrayKwp && (
            <text x="205" y="270" textAnchor="middle" fontSize="15" fontWeight="800" fill={DC}>
              {trim(arrayKwp, 1)} kWp
            </text>
          )}
        </g>

        {/* LA1 lightning arrestor over the array */}
        {p.lightningArresters > 0 && (
          <g stroke={INK} strokeWidth="2.2" fill="none" strokeLinejoin="round">
            <line x1="336" y1="104" x2="336" y2="128" />
            <path d="M328 104 L336 88 L344 104 Z" />
            <text x="352" y="102" fontSize="14" fontWeight="800" fill={INK} stroke="none">LA1</text>
          </g>
        )}

        {/* ---------- DC run: PV1 -> QD1 -> INV1, SPD to earth ---------- */}
        <path d="M296 166 H 440" fill="none" stroke={DC} strokeWidth="3.2" strokeLinecap="round" />
        <path d="M296 166 H 440" fill="none" stroke="#FDE68A" strokeWidth="1" strokeDasharray="2 10" />
        <IsolatorH x={352} y={166} color={DC} />
        <Tag x={352} y={142} anchor="middle" tag="QD1" />
        <line x1="398" y1="166" x2="398" y2="196" stroke={DC} strokeWidth="2.6" />
        <rect x="390" y="196" width="16" height="20" fill="#fff" stroke={DC} strokeWidth="2.6" />
        <line x1="398" y1="216" x2="398" y2="228" stroke={DC} strokeWidth="2.6" />
        <Earth x={398} y={228} color={DC} />
        <text x="380" y="212" textAnchor="end" fontSize="13" fontWeight="700" fill={SUB}>SPD</text>

        {/* ---------- Inverter (illustrated) ---------- */}
        <rect x="440" y="96" width="140" height="146" rx="10" fill="url(#sldInv)" />
        <rect x="452" y="108" width="116" height="78" rx="6" fill="#E2E8F0" />
        <line x1="452" y1="186" x2="568" y2="108" stroke="#64748B" strokeWidth="1.8" />
        <text x="460" y="134" fontSize="24" fontWeight="700" fill={INK}>=</text>
        <text x="538" y="178" fontSize="24" fontWeight="700" fill={INK}>~</text>
        <circle cx="462" cy="212" r="4.5" fill="#34D399" />
        <circle cx="478" cy="212" r="4.5" fill="#FBBF24" />
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1={506 + i * 11} y1="204" x2={506 + i * 11} y2="226" stroke="#94A3B8" strokeWidth="2.2" strokeLinecap="round" />
        ))}
        <Tag x={440} y={84} tag="INV1" rating={inverterText} />

        {/* ---------- AC out -> QA1 -> main LT board ---------- */}
        <path d={`M580 166 H 640 V ${busY}`} fill="none" stroke={AC} strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
        <Breaker x={640} y={290} color={AC} />
        <Tag x={660} y={286} tag="QA1" rating={inverterBreaker ? `${inverterBreaker} A` : undefined} />

        {/* ---------- Main LT board (busbar) ---------- */}
        <line x1="56" y1={busY} x2="946" y2={busY} stroke={INK} strokeWidth="8" />
        <text x="66" y={busY - 14} fontSize="15" fontWeight="800" fill={INK}>MAIN LT BOARD</text>
        <text x="222" y={busY - 14} fontSize="14" fontWeight="600" fill={SUB}>400 V, 3Ph, 4W, 50 Hz</text>
        <Earth x={92} y={busY + 5} />
        <text x="112" y={busY + 24} fontSize="13" fontWeight="700" fill={SUB}>E1</text>
        <circle cx="640" cy={busY} r="5.5" fill={INK} />

        {/* ---------- Utility incomer ---------- */}
        <circle cx={chainX} cy="104" r="22" fill="#fff" stroke={HV} strokeWidth="3" />
        <text x={chainX} y="113" textAnchor="middle" fontSize="26" fill={HV}>~</text>
        <text x={chainX - 34} y="100" textAnchor="end" fontSize="16" fontWeight="800" fill={INK}>LESCO / WAPDA</text>
        <text x={chainX - 34} y="120" textAnchor="end" fontSize="14" fill={SUB}>{p.isHT ? "11 kV, 3Ph, 50 Hz" : "400 V, 3Ph, 50 Hz"}</text>
        {p.isHT ? (
          <>
            <path d={`M${chainX} 126 V 248`} fill="none" stroke={HV} strokeWidth="3.2" strokeLinecap="round" />
            <path d={`M${chainX} 266 V ${busY}`} fill="none" stroke={AC} strokeWidth="3.2" strokeLinecap="round" />
            <Breaker x={chainX} y={160} color={HV} />
            <Tag x={chainX - 24} y={166} anchor="end" tag="QH1" rating="11 kV VCB" />
            <g fill="#fff" strokeWidth="2.8">
              <circle cx={chainX} cy="214" r="20" stroke={HV} />
              <circle cx={chainX} cy="238" r="20" stroke={AC} />
            </g>
            <Tag x={chainX - 32} y={232} anchor="end" tag="T1" rating="11 / 0.4 kV" />
            <circle cx={chainX} cy="296" r="19" fill="#fff" stroke={AC} strokeWidth="2.8" />
            <text x={chainX} y="301" textAnchor="middle" fontSize="13" fontWeight="800" fill={INK}>kWh</text>
            <Tag x={chainX - 30} y={302} anchor="end" tag="M1" />
            <Breaker x={chainX} y={348} color={AC} />
            <Tag x={chainX - 24} y={354} anchor="end" tag="Q1" rating={incomer ? `ACB ${incomer} A` : undefined} />
          </>
        ) : (
          <>
            <path d={`M${chainX} 126 V ${busY}`} fill="none" stroke={AC} strokeWidth="3.2" strokeLinecap="round" />
            <circle cx={chainX} cy="214" r="19" fill="#fff" stroke={AC} strokeWidth="2.8" />
            <text x={chainX} y="219" textAnchor="middle" fontSize="13" fontWeight="800" fill={INK}>kWh</text>
            <Tag x={chainX - 30} y={220} anchor="end" tag="M1" />
            <Breaker x={chainX} y={314} color={AC} />
            <Tag x={chainX - 24} y={320} anchor="end" tag="Q1" rating={incomer ? `${incomer} A` : undefined} />
          </>
        )}

        {/* ---------- Generator behind an ATS ---------- */}
        {gen && (
          <g>
            <path d={`M170 ${busY} V 540`} fill="none" stroke={AC} strokeWidth="3.2" strokeLinecap="round" />
            <rect x="136" y="478" width="68" height="46" rx="6" fill="#fff" stroke="#EA580C" strokeWidth="2.6" />
            <text x="170" y="509" textAnchor="middle" fontSize="17" fontWeight="800" fill="#EA580C">ATS</text>
            <Tag x={222} y={506} tag="ATS1" />
            <rect x="122" y="540" width="96" height="62" rx="8" fill="url(#sldGen)" stroke="#9A3412" strokeWidth="2" />
            <circle cx="170" cy="571" r="24" fill="#fff" stroke="#9A3412" strokeWidth="2.4" />
            <text x="170" y="579" textAnchor="middle" fontSize="22" fontWeight="800" fill={INK}>G</text>
            <Tag x={230} y={566} tag="G1" rating={gen.capacityKw ? `${trim(gen.capacityKw)} kW ${fuel}`.trim() : fuel || undefined} />
          </g>
        )}

        {/* ---------- Factory feeder and loads ---------- */}
        <path d={`M${feederX} ${busY} V 500`} fill="none" stroke={AC} strokeWidth="3.2" strokeLinecap="round" />
        <Breaker x={feederX} y={448} color={AC} />
        <Tag x={feederX + 20} y={454} tag="QF1" />
        <line x1="352" y1="500" x2="926" y2="500" stroke={INK} strokeWidth="6" />
        <text x="338" y="486" fontSize="14" fontWeight="800" fill={INK}>FACTORY DISTRIBUTION</text>
        {["M", "M", "M", "M", "M", "L"].map((tag, i) => {
          const cx = 384 + i * 100;
          return (
            <g key={i}>
              <line x1={cx} y1="500" x2={cx} y2="536" stroke={AC} strokeWidth="2.6" />
              <circle cx={cx} cy="562" r="26" fill="url(#sldMotor)" stroke={INK} strokeWidth="2.6" />
              <text x={cx} y="570" textAnchor="middle" fontSize="21" fontWeight="800" fill={INK}>{tag}</text>
            </g>
          );
        })}
        <text x="640" y="616" textAnchor="middle" fontSize="14" fontWeight="600" fill={SUB}>
          {p.sanctionedLoadKw ? `Sanctioned load ${trim(p.sanctionedLoadKw, 0)} kW: motors, lighting, offices` : "Motors, lighting, offices"}
        </text>

        {/* ---------- Key and title block ---------- */}
        <g fontSize="13" fontWeight="600" fill={INK}>
          <text x="50" y="650" fontWeight="800">KEY</text>
          <line x1="86" y1="646" x2="116" y2="646" stroke={DC} strokeWidth="3.4" />
          <text x="122" y="650">DC</text>
          <line x1="154" y1="646" x2="184" y2="646" stroke={AC} strokeWidth="3.4" />
          <text x="190" y="650">AC</text>
          <line x1="222" y1="646" x2="252" y2="646" stroke={HV} strokeWidth="3.4" />
          <text x="258" y="650">HT</text>
          <text x="300" y="650" fill={SUB} fontWeight="500">Symbols to IEC 60617</text>
        </g>
        <g>
          <rect x="566" y="630" width="396" height="42" fill="#fff" stroke={INK} strokeWidth="1.6" />
          <line x1="566" y1="646" x2="962" y2="646" stroke={INK} strokeWidth="1" />
          <line x1="742" y1="646" x2="742" y2="672" stroke={INK} strokeWidth="1" />
          <line x1="852" y1="646" x2="852" y2="672" stroke={INK} strokeWidth="1" />
          <text x="574" y="642" fontSize="11.5" fontWeight="800" letterSpacing="0.8" fill={INK}>SINGLE LINE DIAGRAM</text>
          <text x="954" y="642" textAnchor="end" fontSize="10.5" fontWeight="600" fill={SUB}>Indicative. Not for construction.</text>
          <text x="574" y="657" fontSize="9" fill={SUB}>CLIENT</text>
          <text x="574" y="668" fontSize="11.5" fontWeight="700" fill={INK}>{(p.customerName || "Customer").slice(0, 22)}</text>
          <text x="750" y="657" fontSize="9" fill={SUB}>REFERENCE</text>
          <text x="750" y="668" fontSize="11.5" fontWeight="700" fill={INK}>{p.reference}</text>
          <text x="860" y="657" fontSize="9" fill={SUB}>DATE</text>
          <text x="860" y="668" fontSize="11.5" fontWeight="700" fill={INK}>{p.dateLabel}</text>
        </g>
      </svg>

      {/* ---------- Equipment schedule ---------- */}
      <div className="border-t border-slate-300">
        <p className="bg-slate-100 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700 print:bg-white">Equipment schedule</p>
        <table className="w-full border-collapse text-left text-[11.5px] leading-snug">
          <thead>
            <tr className="border-b border-slate-300 text-slate-500">
              <th className="w-16 px-3 py-1.5 font-semibold">Tag</th>
              <th className="w-[34%] px-3 py-1.5 font-semibold">Item</th>
              <th className="px-3 py-1.5 font-semibold">Rating / detail</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row) => (
              <tr key={row.tag} className="border-b border-slate-200 last:border-b-0">
                <td className="px-3 py-1.5 font-mono font-bold text-slate-900">{row.tag}</td>
                <td className="px-3 py-1.5 font-semibold text-slate-800">{row.item}</td>
                <td className="px-3 py-1.5 text-slate-600">{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-slate-300 px-3 py-2 text-[10.5px] leading-relaxed text-slate-500">
          Breaker ratings are indicative: the next standard frame above 1.25 times the inverter AC current (
          {singlePhase ? "230 V single phase" : "400 V three phase"}). Cable sizes, protection settings, transformer rating and earthing resistance are fixed in the
          final design after the site survey, to NEPRA and IEC 60364 requirements.
        </p>
      </div>
    </div>
  );
}
