import type { ReactNode } from "react";

/**
 * Indicative electrical single line diagram for an industrial quotation:
 * PV array, DC isolation, inverter(s), AC protection, main LT busbar, the
 * LESCO/WAPDA incomer (with the HT transformer when the site has an HT
 * connection), an optional generator behind an ATS, the factory feeder and
 * earthing / lightning protection. Everything drawn comes from the quote or
 * from what the customer entered; ratings are computed, never invented, and
 * the title block says the drawing is indicative.
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
const DC = "#B45309";
const MUTED = "#64748B";

function Breaker({ x, y, cb = true }: { x: number; y: number; cb?: boolean }) {
  return (
    <g stroke={INK} strokeWidth="1.6" fill="none">
      <line x1={x} y1={y - 22} x2={x} y2={y - 9} />
      <line x1={x} y1={y + 9} x2={x} y2={y + 22} />
      <line x1={x} y1={y + 9} x2={x - 9} y2={y - 9} />
      {cb && (
        <>
          <line x1={x - 4} y1={y - 13} x2={x + 4} y2={y - 5} />
          <line x1={x + 4} y1={y - 13} x2={x - 4} y2={y - 5} />
        </>
      )}
    </g>
  );
}

function Isolator({ x, y, horizontal, color = INK }: { x: number; y: number; horizontal?: boolean; color?: string }) {
  return (
    <g stroke={color} strokeWidth="1.6" fill="none" transform={horizontal ? `rotate(-90 ${x} ${y})` : undefined}>
      <line x1={x} y1={y - 22} x2={x} y2={y - 9} />
      <line x1={x} y1={y + 9} x2={x} y2={y + 22} />
      <line x1={x} y1={y + 9} x2={x - 9} y2={y - 9} />
    </g>
  );
}

function Earth({ x, y }: { x: number; y: number }) {
  return (
    <g stroke={INK} strokeWidth="1.6">
      <line x1={x} y1={y} x2={x} y2={y + 12} />
      <line x1={x - 11} y1={y + 12} x2={x + 11} y2={y + 12} />
      <line x1={x - 7} y1={y + 17} x2={x + 7} y2={y + 17} />
      <line x1={x - 3} y1={y + 22} x2={x + 3} y2={y + 22} />
    </g>
  );
}

function Label({ x, y, lines, anchor = "start", bold }: { x: number; y: number; lines: ReactNode[]; anchor?: "start" | "middle" | "end"; bold?: boolean }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize="12.5" fill={INK} fontWeight={bold ? 700 : 400}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 14} fill={i === 0 || !bold ? INK : MUTED} fontWeight={i === 0 && bold ? 700 : 400}>
          {line}
        </tspan>
      ))}
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
  const genLabel = gen ? `${gen.fuel === "GAS" ? "Gas" : gen.fuel === "DIESEL" ? "Diesel" : ""} generator`.trim() : "";

  // Vertical positions of the grid incomer chain, which is longer with an HT transformer.
  const busY = 330;
  const gridX = 860;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white print:overflow-visible print:border-slate-400">
      <svg
        viewBox="0 0 1000 640"
        role="img"
        aria-label="Electrical single line diagram of the proposed solar plant"
        className="h-auto w-full min-w-[700px] print:min-w-0"
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
      >
        <rect x="6" y="6" width="988" height="628" fill="none" stroke={INK} strokeWidth="1.5" />

        {/* ---------- PV array ---------- */}
        <g>
          <rect x="36" y="64" width="170" height="92" fill="#FFFBEB" stroke={DC} strokeWidth="1.8" />
          {[0, 1, 2, 3].map((c) =>
            [0, 1].map((r) => (
              <rect key={`${c}-${r}`} x={46 + c * 40} y={74 + r * 36} width="34" height="30" fill="none" stroke={DC} strokeWidth="1" />
            )),
          )}
          <Label x={121} y={50} anchor="middle" bold lines={["PV ARRAY"]} />
          <Label
            x={121}
            y={176}
            anchor="middle"
            lines={[
              `${p.panelCount} x ${p.panelWatt ? `${p.panelWatt} Wp` : p.panelLabel}`,
              arrayKwp ? `${trim(arrayKwp, 1)} kWp` : "",
            ]}
          />
          <Label x={121} y={206} anchor="middle" lines={[p.panelLabel]} />
        </g>

        {/* DC run to the inverter: DC isolator + DC SPD */}
        <line x1="206" y1="110" x2="248" y2="110" stroke={DC} strokeWidth="2" />
        <Isolator x={278} y={110} horizontal color={DC} />
        <line x1="300" y1="110" x2="338" y2="110" stroke={DC} strokeWidth="2" />
        <Label x={278} y={80} anchor="middle" lines={["DC isolator"]} />
        <Label x={278} y={146} anchor="middle" lines={["+ DC SPD"]} />
        <g stroke={DC} strokeWidth="1.6">
          <line x1="316" y1="110" x2="316" y2="130" />
          <rect x="310" y="130" width="12" height="16" fill="none" />
          <line x1="316" y1="146" x2="316" y2="154" />
        </g>
        <Earth x={316} y={154} />
        <Label x={272} y={118} anchor="middle" lines={[""]} />
        <text x="222" y="102" fontSize="10.5" fill={DC} textAnchor="middle">DC +/-</text>

        {/* ---------- Inverter ---------- */}
        <g>
          <rect x="338" y="64" width="150" height="92" fill="#F0FDF4" stroke={INK} strokeWidth="1.8" />
          <line x1="338" y1="156" x2="488" y2="64" stroke={INK} strokeWidth="1.4" />
          <text x="354" y="90" fontSize="20" fill={INK}>=</text>
          <text x="458" y="142" fontSize="20" fill={INK}>~</text>
          <Label x={413} y={50} anchor="middle" bold lines={["INVERTER"]} />
          <Label
            x={413}
            y={176}
            anchor="middle"
            lines={[
              `${p.inverterQuantity > 1 ? `${p.inverterQuantity} x ` : ""}${p.inverterKwEach ? `${trim(p.inverterKwEach)} kW` : ""}`,
              acKw ? `${trim(acKw)} kW AC, ${singlePhase ? "1" : "3"}Ph ${volts} V` : "",
            ]}
          />
          <Label x={413} y={206} anchor="middle" lines={[p.inverterLabel]} />
        </g>

        {/* AC out of the inverter, breaker, down to the main bus */}
        <polyline points="488,110 560,110 560,330" fill="none" stroke={INK} strokeWidth="2" />
        <Breaker x={560} y={215} />
        <Label
          x={576}
          y={205}
          lines={[
            "AC MCCB",
            inverterBreaker ? `${inverterBreaker} A (indicative)` : "rated to inverter output",
          ]}
        />
        <Label x={576} y={252} lines={["Solar feed-in"]} />

        {/* ---------- Main LT busbar ---------- */}
        <line x1="90" y1={busY} x2="930" y2={busY} stroke={INK} strokeWidth="6" strokeLinecap="round" />
        <Label x={96} y={busY - 12} bold lines={["MAIN LT DISTRIBUTION BOARD  |  400 V, 3Ph, 4W, 50 Hz"]} />
        <Earth x={110} y={busY + 3} />
        <Label x={128} y={busY + 22} lines={["Earth bar"]} />

        {/* ---------- Grid incomer ---------- */}
        <g>
          <circle cx={gridX} cy="54" r="16" fill="none" stroke={INK} strokeWidth="1.8" />
          <text x={gridX} y="59" fontSize="15" textAnchor="middle" fill={INK}>~</text>
          <Label x={gridX - 28} y={48} anchor="end" bold lines={["LESCO / WAPDA"]} />
          <Label x={gridX - 28} y={63} anchor="end" lines={[p.isHT ? "11 kV, 3Ph, 50 Hz" : "400 V, 3Ph, 50 Hz"]} />
          <line x1={gridX} y1="70" x2={gridX} y2={p.isHT ? 86 : 140} stroke={INK} strokeWidth="2" />
          {p.isHT ? (
            <>
              <Breaker x={gridX} y={108} />
              <Label x={gridX - 24} y={104} anchor="end" lines={["HT VCB", "11 kV"]} />
              <line x1={gridX} y1="130" x2={gridX} y2="150" stroke={INK} strokeWidth="2" />
              <g fill="none" stroke={INK} strokeWidth="1.8">
                <circle cx={gridX} cy="165" r="15" />
                <circle cx={gridX} cy="183" r="15" />
              </g>
              <Label x={gridX - 28} y={162} anchor="end" lines={["Transformer", "11 / 0.4 kV"]} />
              <line x1={gridX} y1="198" x2={gridX} y2="222" stroke={INK} strokeWidth="2" />
              <circle cx={gridX} cy="240" r="15" fill="none" stroke={INK} strokeWidth="1.8" />
              <text x={gridX} y="244" fontSize="10.5" textAnchor="middle" fill={INK}>kWh</text>
              <Label x={gridX - 28} y={238} anchor="end" lines={["LESCO meter"]} />
              <line x1={gridX} y1="255" x2={gridX} y2="280" stroke={INK} strokeWidth="2" />
              <Breaker x={gridX} y={296} />
              <Label x={gridX - 24} y={290} anchor="end" lines={["Main incomer", incomer ? `ACB ${incomer} A` : "ACB per sanctioned load"]} />
              <line x1={gridX} y1="318" x2={gridX} y2={busY} stroke={INK} strokeWidth="2" />
            </>
          ) : (
            <>
              <circle cx={gridX} cy="162" r="15" fill="none" stroke={INK} strokeWidth="1.8" />
              <text x={gridX} y="166" fontSize="10.5" textAnchor="middle" fill={INK}>kWh</text>
              <Label x={gridX - 28} y={160} anchor="end" lines={["LESCO meter"]} />
              <line x1={gridX} y1="140" x2={gridX} y2="147" stroke={INK} strokeWidth="2" />
              <line x1={gridX} y1="177" x2={gridX} y2="250" stroke={INK} strokeWidth="2" />
              <Breaker x={gridX} y={274} />
              <Label x={gridX - 24} y={268} anchor="end" lines={["Main incomer", incomer ? `MCCB / ACB ${incomer} A` : "per sanctioned load"]} />
              <line x1={gridX} y1="296" x2={gridX} y2={busY} stroke={INK} strokeWidth="2" />
            </>
          )}
        </g>

        {/* ---------- Generator behind an ATS (only if the customer has one) ---------- */}
        {gen && (
          <g>
            <circle cx="170" cy="560" r="20" fill="none" stroke={INK} strokeWidth="1.8" />
            <text x="170" y="565" fontSize="15" fontWeight="700" textAnchor="middle" fill={INK}>G</text>
            <Label x={170} y={604} anchor="middle" bold lines={[genLabel]} />
            <Label x={170} y={618} anchor="middle" lines={[gen.capacityKw ? `${trim(gen.capacityKw)} kW standby` : "standby"]} />
            <line x1="170" y1="540" x2="170" y2="478" stroke={INK} strokeWidth="2" />
            <rect x="140" y="430" width="60" height="48" fill="#FFF7ED" stroke={INK} strokeWidth="1.8" />
            <text x="170" y="458" fontSize="13" fontWeight="700" textAnchor="middle" fill={INK}>ATS</text>
            <line x1="170" y1="430" x2="170" y2={busY} stroke={INK} strokeWidth="2" />
            <Label x={210} y={448} lines={["Auto changeover", "generator interlocked with grid"]} />
          </g>
        )}

        {/* ---------- Factory feeder and loads ---------- */}
        <line x1="560" y1={busY} x2="560" y2="400" stroke={INK} strokeWidth="2" />
        <Breaker x={560} y={420} />
        <Label x={576} y={414} lines={["Feeder MCCB", "to factory loads"]} />
        <line x1="560" y1="442" x2="560" y2="480" stroke={INK} strokeWidth="2" />
        <rect x="380" y="480" width="360" height="100" fill="#FFF7ED" stroke={INK} strokeWidth="1.8" />
        <Label x={560} y={500} anchor="middle" bold lines={["FACTORY LOADS"]} />
        {[430, 500, 570, 640, 710].slice(0, 4).map((cx, i) => (
          <g key={cx}>
            <line x1={cx + 8} y1="512" x2={cx + 8} y2="524" stroke={INK} strokeWidth="1.4" />
            <circle cx={cx + 8} cy="540" r="14" fill="#fff" stroke={INK} strokeWidth="1.6" />
            <text x={cx + 8} y="545" fontSize="13" fontWeight="700" textAnchor="middle" fill={INK}>{i === 3 ? "L" : "M"}</text>
          </g>
        ))}
        <Label
          x={560}
          y={572}
          anchor="middle"
          lines={[
            p.sanctionedLoadKw ? `Sanctioned load ${trim(p.sanctionedLoadKw, 0)} kW  |  motors, lighting, offices` : "Motors, lighting, offices",
          ]}
        />

        {/* ---------- Earthing and lightning protection ---------- */}
        <g>
          <line x1="316" y1="154" x2="316" y2="154" />
          <Label x={304} y={196} anchor="end" lines={[p.earthingPits > 0 ? `Earth pits x ${p.earthingPits}` : "Earthing per IEC 60364"]} />
        </g>
        <g>
          <line x1="36" y1="44" x2="36" y2="30" stroke={INK} strokeWidth="1.8" />
          <path d="M30 30 L36 18 L42 30 Z" fill="none" stroke={INK} strokeWidth="1.6" />
          <text x="48" y="28" fontSize="10.5" fill={INK}>
            {p.lightningArresters > 0 ? `Lightning arrestor x ${p.lightningArresters}` : "Lightning protection"}
          </text>
        </g>

        {/* ---------- Legend ---------- */}
        <g fontSize="10.5" fill={INK}>
          <line x1="40" y1="276" x2="74" y2="276" stroke={DC} strokeWidth="2" />
          <text x="82" y="280">DC circuit</text>
          <line x1="40" y1="294" x2="74" y2="294" stroke={INK} strokeWidth="2" />
          <text x="82" y="298">AC circuit</text>
        </g>

        {/* ---------- Title block ---------- */}
        <g>
          <rect x="770" y="500" width="214" height="128" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <line x1="770" y1="524" x2="984" y2="524" stroke={INK} strokeWidth="1" />
          <text x="877" y="517" fontSize="12" fontWeight="700" textAnchor="middle" fill={INK}>SINGLE LINE DIAGRAM</text>
          <text x="780" y="544" fontSize="10.5" fill={MUTED}>Client</text>
          <text x="780" y="558" fontSize="12" fill={INK}>{p.customerName || "Customer"}</text>
          <text x="780" y="578" fontSize="10.5" fill={MUTED}>Reference</text>
          <text x="780" y="592" fontSize="11.5" fill={INK}>{p.reference}</text>
          <text x="900" y="578" fontSize="10.5" fill={MUTED}>Date</text>
          <text x="900" y="592" fontSize="11.5" fill={INK}>{p.dateLabel}</text>
          <text x="877" y="615" fontSize="9.5" textAnchor="middle" fill={MUTED}>Indicative. Not for construction.</text>
        </g>
      </svg>
      <p className="border-t border-slate-200 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
        Breaker ratings are indicative: AC current from the inverter output at 400 V (230 V single phase), with the next standard frame at
        1.25 times the current. Cable sizes, protection settings, transformer rating and earthing resistance are fixed in the final design after the
        site survey, to NEPRA and IEC 60364 requirements.
      </p>
    </div>
  );
}
