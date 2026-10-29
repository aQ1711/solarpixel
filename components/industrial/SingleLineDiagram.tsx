/**
 * Indicative electrical single line diagram for an industrial quotation,
 * drawn the way a design office issues one: a framed sheet with grid
 * references, standard IEC symbols on orthogonal conductors, every device
 * carrying a tag (PV1, INV1, QA1, T1...) and an equipment schedule beneath
 * that gives the ratings, with a title block in the corner. Only devices that
 * are really in the quote are drawn; ratings are computed from the quote's
 * own numbers, never invented.
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

const INK = "#111827";
const SUB = "#4B5563";
const DC = "#B45309";
const W = 1000;
const H = 660;

/** White gap behind a device so the conductor appears to pass through it. */
function Gap({ x, y, w = 30, h = 34 }: { x: number; y: number; w?: number; h?: number }) {
  return <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill="#fff" />;
}

/** Circuit breaker on a vertical conductor: blade plus the breaking cross. */
function Breaker({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Gap x={x} y={y} />
      <g stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round">
        <line x1={x} y1={y - 17} x2={x} y2={y - 10} />
        <line x1={x} y1={y + 10} x2={x} y2={y + 17} />
        <line x1={x} y1={y + 10} x2={x - 9} y2={y - 9} />
        <line x1={x - 4} y1={y - 15} x2={x + 4} y2={y - 7} />
        <line x1={x + 4} y1={y - 15} x2={x - 4} y2={y - 7} />
      </g>
    </g>
  );
}

/** Isolator on a horizontal conductor. */
function IsolatorH({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <Gap x={x} y={y} w={34} h={26} />
      <g stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round">
        <line x1={x - 17} y1={y} x2={x - 8} y2={y} />
        <line x1={x - 8} y1={y} x2={x + 8} y2={y - 11} />
        <line x1={x + 10} y1={y} x2={x + 17} y2={y} />
      </g>
    </g>
  );
}

function Earth({ x, y, color = INK }: { x: number; y: number; color?: string }) {
  return (
    <g stroke={color} strokeWidth="2.2" strokeLinecap="round">
      <line x1={x} y1={y} x2={x} y2={y + 10} />
      <line x1={x - 12} y1={y + 10} x2={x + 12} y2={y + 10} />
      <line x1={x - 8} y1={y + 16} x2={x + 8} y2={y + 16} />
      <line x1={x - 4} y1={y + 22} x2={x + 4} y2={y + 22} />
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
    <text x={x} y={y} textAnchor={anchor} fontSize="15" fontWeight="800" fill={INK}>
      {tag}
      {rating && (
        <tspan fontWeight="500" fill={SUB} fontSize="13.5" dx="7">
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

  const busY = 350;
  const chainX = 840;

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

        {/* ---------- PV array ---------- */}
        <g>
          <rect x="70" y="84" width="160" height="84" fill="#fff" stroke={DC} strokeWidth="2.4" />
          {[0, 1, 2, 3].map((c) =>
            [0, 1].map((r) => <rect key={`${c}-${r}`} x={77 + c * 38} y={91 + r * 36} width="33" height="31" fill="none" stroke={DC} strokeWidth="1.2" />),
          )}
          <Tag
            x={70}
            y={72}
            tag="PV1"
            rating={`${p.panelCount} x ${p.panelWatt ? `${p.panelWatt} Wp` : "panels"}`}
          />
          {arrayKwp && (
            <text x="150" y="190" textAnchor="middle" fontSize="14" fontWeight="700" fill={DC}>
              {trim(arrayKwp, 1)} kWp
            </text>
          )}
        </g>

        {/* LA1 lightning arrestor over the array */}
        {p.lightningArresters > 0 && (
          <g stroke={INK} strokeWidth="2" fill="none" strokeLinejoin="round">
            <line x1="250" y1="62" x2="250" y2="84" />
            <path d="M243 62 L250 48 L257 62 Z" />
            <text x="266" y="60" fontSize="13" fontWeight="700" fill={INK} stroke="none">LA1</text>
          </g>
        )}

        {/* ---------- DC run: PV1 -> QD1 -> INV1, SPD to earth ---------- */}
        <path d="M230 126 H 400" fill="none" stroke={DC} strokeWidth="2.6" strokeLinecap="round" />
        <IsolatorH x={285} y={126} color={DC} />
        <Tag x={285} y={104} anchor="middle" tag="QD1" />
        <line x1="345" y1="126" x2="345" y2="150" stroke={DC} strokeWidth="2.2" />
        <rect x="338" y="150" width="14" height="16" fill="#fff" stroke={DC} strokeWidth="2.2" />
        <line x1="345" y1="166" x2="345" y2="176" stroke={DC} strokeWidth="2.2" />
        <Earth x={345} y={176} color={DC} />
        <text x="362" y="164" fontSize="12.5" fontWeight="600" fill={SUB}>SPD</text>
        <text x="236" y="119" fontSize="12.5" fontWeight="700" fill={DC}>DC</text>

        {/* ---------- Inverter ---------- */}
        <rect x="400" y="84" width="120" height="84" fill="#fff" stroke={INK} strokeWidth="2.4" />
        <line x1="400" y1="168" x2="520" y2="84" stroke={INK} strokeWidth="1.6" />
        <text x="410" y="108" fontSize="22" fontWeight="700" fill={INK}>=</text>
        <text x="494" y="160" fontSize="22" fontWeight="700" fill={INK}>~</text>
        <Tag x={400} y={72} tag="INV1" rating={inverterText} />

        {/* ---------- AC out -> QA1 -> main LT board ---------- */}
        <path d={`M520 126 H 600 V ${busY}`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        <Breaker x={600} y={250} />
        <Tag x={618} y={246} tag="QA1" rating={inverterBreaker ? `${inverterBreaker} A` : undefined} />

        {/* ---------- Main LT board (busbar) ---------- */}
        <line x1="60" y1={busY} x2="940" y2={busY} stroke={INK} strokeWidth="6" strokeLinecap="butt" />
        <text x="70" y={busY - 12} fontSize="14.5" fontWeight="800" fill={INK}>MAIN LT BOARD</text>
        <text x="215" y={busY - 12} fontSize="13.5" fontWeight="500" fill={SUB}>400 V, 3Ph, 4W, 50 Hz</text>
        <Earth x={95} y={busY + 4} />
        <text x="114" y={busY + 22} fontSize="12.5" fontWeight="600" fill={SUB}>E1</text>
        <circle cx="600" cy={busY} r="4.5" fill={INK} />

        {/* ---------- Utility incomer ---------- */}
        <circle cx={chainX} cy="84" r="19" fill="#fff" stroke={INK} strokeWidth="2.4" />
        <text x={chainX} y="92" textAnchor="middle" fontSize="22" fill={INK}>~</text>
        <text x={chainX - 30} y="80" textAnchor="end" fontSize="15" fontWeight="800" fill={INK}>LESCO / WAPDA</text>
        <text x={chainX - 30} y="98" textAnchor="end" fontSize="13.5" fill={SUB}>{p.isHT ? "11 kV, 3Ph, 50 Hz" : "400 V, 3Ph, 50 Hz"}</text>
        {p.isHT ? (
          <>
            <path d={`M${chainX} 103 V ${busY}`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
            <Breaker x={chainX} y={138} />
            <Tag x={chainX - 20} y={142} anchor="end" tag="QH1" rating="11 kV VCB" />
            <g fill="#fff" stroke={INK} strokeWidth="2.4">
              <circle cx={chainX} cy="190" r="17" />
              <circle cx={chainX} cy="212" r="17" />
            </g>
            <Tag x={chainX - 28} y={206} anchor="end" tag="T1" rating="11 / 0.4 kV" />
            <circle cx={chainX} cy="262" r="16" fill="#fff" stroke={INK} strokeWidth="2.4" />
            <text x={chainX} y="267" textAnchor="middle" fontSize="12" fontWeight="700" fill={INK}>kWh</text>
            <Tag x={chainX - 26} y={267} anchor="end" tag="M1" />
            <Breaker x={chainX} y={312} />
            <Tag x={chainX - 20} y={316} anchor="end" tag="Q1" rating={incomer ? `ACB ${incomer} A` : undefined} />
          </>
        ) : (
          <>
            <path d={`M${chainX} 103 V ${busY}`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
            <circle cx={chainX} cy="170" r="16" fill="#fff" stroke={INK} strokeWidth="2.4" />
            <text x={chainX} y="175" textAnchor="middle" fontSize="12" fontWeight="700" fill={INK}>kWh</text>
            <Tag x={chainX - 26} y={175} anchor="end" tag="M1" />
            <Breaker x={chainX} y={266} />
            <Tag x={chainX - 20} y={270} anchor="end" tag="Q1" rating={incomer ? `${incomer} A` : undefined} />
          </>
        )}

        {/* ---------- Generator behind an ATS ---------- */}
        {gen && (
          <g>
            <path d={`M170 ${busY} V 496`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
            <rect x="140" y="420" width="60" height="44" fill="#fff" stroke={INK} strokeWidth="2.4" />
            <text x="170" y="448" textAnchor="middle" fontSize="15" fontWeight="800" fill={INK}>ATS</text>
            <Tag x={216} y={446} tag="ATS1" />
            <circle cx="170" cy="522" r="26" fill="#fff" stroke={INK} strokeWidth="2.4" />
            <text x="170" y="530" textAnchor="middle" fontSize="22" fontWeight="800" fill={INK}>G</text>
            <Tag x={206} y={518} tag="G1" rating={gen.capacityKw ? `${trim(gen.capacityKw)} kW ${fuel}`.trim() : fuel || undefined} />
          </g>
        )}

        {/* ---------- Factory feeder and loads ---------- */}
        <path d={`M600 ${busY} V 462`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
        <Breaker x={600} y={396} />
        <Tag x={618} y={392} tag="QF1" />
        <line x1="400" y1="462" x2="820" y2="462" stroke={INK} strokeWidth="5" />
        <text x="410" y="452" fontSize="13.5" fontWeight="700" fill={INK}>FACTORY DISTRIBUTION</text>
        {["M", "M", "M", "M", "L"].map((tag, i) => {
          const cx = 440 + i * 90;
          return (
            <g key={i}>
              <line x1={cx} y1="462" x2={cx} y2="496" stroke={INK} strokeWidth="2.2" />
              <circle cx={cx} cy="518" r="22" fill="#fff" stroke={INK} strokeWidth="2.4" />
              <text x={cx} y="526" textAnchor="middle" fontSize="19" fontWeight="800" fill={INK}>{tag}</text>
            </g>
          );
        })}
        <text x="620" y="558" textAnchor="middle" fontSize="13.5" fontWeight="600" fill={SUB}>
          {p.sanctionedLoadKw ? `Sanctioned load ${trim(p.sanctionedLoadKw, 0)} kW: motors, lighting, offices` : "Motors, lighting, offices"}
        </text>

        {/* ---------- Key and title block ---------- */}
        <g fontSize="12.5" fontWeight="600" fill={INK}>
          <text x="50" y="598" fontWeight="800">KEY</text>
          <line x1="86" y1="594" x2="116" y2="594" stroke={DC} strokeWidth="3" />
          <text x="122" y="598">DC</text>
          <line x1="154" y1="594" x2="184" y2="594" stroke={INK} strokeWidth="3" />
          <text x="190" y="598">AC</text>
          <text x="50" y="622" fill={SUB} fontWeight="500">Symbols to IEC 60617</text>
        </g>
        <g>
          <rect x="566" y="574" width="396" height="50" fill="#fff" stroke={INK} strokeWidth="1.6" />
          <line x1="566" y1="592" x2="962" y2="592" stroke={INK} strokeWidth="1" />
          <line x1="742" y1="592" x2="742" y2="624" stroke={INK} strokeWidth="1" />
          <line x1="852" y1="592" x2="852" y2="624" stroke={INK} strokeWidth="1" />
          <text x="574" y="587" fontSize="12" fontWeight="800" letterSpacing="0.8" fill={INK}>SINGLE LINE DIAGRAM</text>
          <text x="954" y="587" textAnchor="end" fontSize="10.5" fontWeight="600" fill={SUB}>Indicative. Not for construction.</text>
          <text x="574" y="604" fontSize="9.5" fill={SUB}>CLIENT</text>
          <text x="574" y="618" fontSize="12" fontWeight="700" fill={INK}>{(p.customerName || "Customer").slice(0, 22)}</text>
          <text x="750" y="604" fontSize="9.5" fill={SUB}>REFERENCE</text>
          <text x="750" y="618" fontSize="12" fontWeight="700" fill={INK}>{p.reference}</text>
          <text x="860" y="604" fontSize="9.5" fill={SUB}>DATE</text>
          <text x="860" y="618" fontSize="12" fontWeight="700" fill={INK}>{p.dateLabel}</text>
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
