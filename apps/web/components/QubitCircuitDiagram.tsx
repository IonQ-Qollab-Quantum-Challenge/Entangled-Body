"use client";

import { useMemo } from "react";

import type { BodyRegion, QuantumNodeState } from "../lib/bodyRegions";
import type { QuantumMeasurementPayload } from "../lib/quantumClient";
import { linksWithStrength, REGIONS, shortLabel } from "../lib/quantumCircuitData";

// Conventional circuit layout: one horizontal wire per qubit (q0..qN), an RY
// state-prep gate on every wire, an RZZ two-qubit gate for each entanglement
// link, then a measurement on every wire — mirroring circuits.py.
const TOP = 22;
const ROW_GAP = 18;
const LABEL_W = 56;
const RY_X = LABEL_W + 16;
const RZZ_START_X = RY_X + 24;
const COL_GAP = 30;
const RIGHT_PAD = 78;
const GATE_H = 12;
const DOT_TAIL = 28;
const WINDOW = 20;

const N = REGIONS.length;
const QUBIT_INDEX = new Map<BodyRegion, number>(REGIONS.map((region) => [region.id, region.qubitIndex]));

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function gateColumnX(column: number): number {
  return RZZ_START_X + column * COL_GAP;
}

type CircuitProps = {
  measurement?: QuantumMeasurementPayload | null;
  highlightRegion?: BodyRegion | null;
  mode: "superposition" | "collapse";
  collapseProgress: number;
  onCollapseRegion?: (region: BodyRegion, qubitIndex: number) => void;
};

export function QubitCircuitDiagram({ measurement, highlightRegion = null, mode, collapseProgress, onCollapseRegion }: CircuitProps) {
  const nodeStateByRegion = useMemo(() => {
    const map = new Map<string, QuantumNodeState>();
    for (const node of measurement?.nodeStates ?? []) {
      map.set(node.region, node);
    }
    return map;
  }, [measurement]);

  // Pack RZZ gates into columns so two gates never overlap on the same wires.
  const { gates, columnCount } = useMemo(() => {
    const edges = linksWithStrength(measurement)
      .map((link) => {
        const a = QUBIT_INDEX.get(link.source);
        const b = QUBIT_INDEX.get(link.target);
        if (a === undefined || b === undefined) return null;
        return { source: link.source, target: link.target, strength: link.strength, lo: Math.min(a, b), hi: Math.max(a, b) };
      })
      .filter((edge): edge is NonNullable<typeof edge> => edge !== null)
      .sort((left, right) => left.hi - left.lo - (right.hi - right.lo) || left.lo - right.lo);

    const columns: Array<Array<[number, number]>> = [];
    const placed = edges.map((edge) => {
      let column = columns.findIndex((spans) => spans.every(([lo, hi]) => edge.hi < lo || edge.lo > hi));
      if (column === -1) {
        column = columns.length;
        columns.push([]);
      }
      columns[column].push([edge.lo, edge.hi]);
      return { ...edge, column };
    });
    return { gates: placed, columnCount: columns.length };
  }, [measurement]);

  const distribution = useMemo(() => {
    const counts = measurement?.counts;
    if (!counts || Object.keys(counts).length === 0) return null;
    const entries = Object.entries(counts).sort((left, right) => right[1] - left[1]);
    const shots = measurement?.shots ?? entries.reduce((sum, [, count]) => sum + count, 0) ?? 1;
    return { entries: entries.slice(0, 4), shots: Math.max(1, shots), dominant: measurement?.dominantBitstring };
  }, [measurement]);

  const measureX = RZZ_START_X + columnCount * COL_GAP + 8;
  const width = measureX + RIGHT_PAD;
  const height = TOP + (N - 1) * ROW_GAP + 22;
  const wireY = (qubitIndex: number) => TOP + qubitIndex * ROW_GAP;

  const collapse = mode === "collapse" ? clamp01(collapseProgress) : 0;
  const reacting = collapse > 0.001;
  const observedQubit = highlightRegion ? QUBIT_INDEX.get(highlightRegion) : undefined;
  const originIndex = observedQubit ?? Math.floor(N / 2);
  const dotStart = LABEL_W - 4;
  const dotEnd = measureX + DOT_TAIL;

  // Collapse propagation: a dot starts at the clicked qubit and travels right;
  // when it crosses an RZZ gate it spawns a new dot on the linked qubit, which
  // then flows right too. We model this as a shortest-arrival ("pseudo-time")
  // search over the entanglement graph, where pseudo-time advances 1 unit per
  // x-unit a dot travels. The single collapseProgress is mapped onto it.
  const propagation = useMemo(() => {
    const adjacency = new Map<number, Array<{ other: number; gateX: number }>>();
    for (const gate of gates) {
      const gateX = gateColumnX(gate.column);
      if (!adjacency.has(gate.lo)) adjacency.set(gate.lo, []);
      if (!adjacency.has(gate.hi)) adjacency.set(gate.hi, []);
      adjacency.get(gate.lo)!.push({ other: gate.hi, gateX });
      adjacency.get(gate.hi)!.push({ other: gate.lo, gateX });
    }

    const spawnTime = new Array<number>(N).fill(Infinity);
    const spawnX = new Array<number>(N).fill(dotStart);
    spawnTime[originIndex] = 0;
    spawnX[originIndex] = dotStart;

    const visited = new Set<number>();
    while (visited.size < N) {
      let current = -1;
      let best = Infinity;
      for (let i = 0; i < N; i += 1) {
        if (!visited.has(i) && spawnTime[i] < best) {
          best = spawnTime[i];
          current = i;
        }
      }
      if (current === -1) break;
      visited.add(current);
      for (const { other, gateX } of adjacency.get(current) ?? []) {
        if (gateX < spawnX[current]) continue; // the dot already passed this gate
        const arrival = spawnTime[current] + (gateX - spawnX[current]);
        if (arrival < spawnTime[other]) {
          spawnTime[other] = arrival;
          spawnX[other] = gateX;
        }
      }
    }

    // Any qubit the rightward cascade never reaches still gets its own dot from
    // the left, just after the cascade, so every qubit is prepared + measured.
    const reachedMax = spawnTime.reduce((max, time) => (Number.isFinite(time) ? Math.max(max, time) : max), 0);
    for (let i = 0; i < N; i += 1) {
      if (!Number.isFinite(spawnTime[i])) {
        spawnTime[i] = reachedMax + (RY_X - dotStart);
        spawnX[i] = dotStart;
      }
    }

    const gateTrigger = gates.map((gate) => {
      const gateX = gateColumnX(gate.column);
      const fromLo = gateX >= spawnX[gate.lo] ? spawnTime[gate.lo] + (gateX - spawnX[gate.lo]) : Infinity;
      const fromHi = gateX >= spawnX[gate.hi] ? spawnTime[gate.hi] + (gateX - spawnX[gate.hi]) : Infinity;
      return Math.min(fromLo, fromHi);
    });

    let tmax = 1;
    for (let i = 0; i < N; i += 1) {
      tmax = Math.max(tmax, spawnTime[i] + (dotEnd - spawnX[i]));
    }

    return { spawnTime, spawnX, gateTrigger, tmax };
  }, [gates, originIndex, measureX, dotEnd]);

  // Global pseudo-clock for the current collapse progress.
  const clock = collapse * propagation.tmax;

  const p1Of = (region: BodyRegion) => measurement?.marginals?.[region]?.p1 ?? nodeStateByRegion.get(region)?.activation ?? 0;

  return (
    <section className="quantum-dashboard__circuit" aria-label="Conventional qubit circuit diagram">
      <div className="quantum-dashboard__section-title">
        Circuit · {N} qubits · RY → RZZ → measure
      </div>
      <div className="quantum-circuit-scroll">
        <svg
          className="quantum-circuit-wires"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={`Quantum circuit with ${N} qubits, RY preparation gates, ${gates.length} RZZ entangling gates and measurements`}
        >
          {/* Wires + qubit labels + RY shaping + superposition + measurement */}
          {REGIONS.map((region) => {
            const qi = region.qubitIndex;
            const y = wireY(qi);
            const isHighlight = highlightRegion === region.id;
            const state = nodeStateByRegion.get(region.id);
            const collapsed = state?.collapsed === true;
            const hasState = Boolean(state || measurement?.marginals?.[region.id]);

            const p1 = p1Of(region.id);
            const pct = Math.round(clamp01(p1) * 100);
            const theta = 2 * Math.asin(Math.sqrt(clamp01(p1)));

            const spawnTime = propagation.spawnTime[qi];
            const spawnX = propagation.spawnX[qi];
            const ryArrive = spawnTime + Math.max(0, RY_X - spawnX);
            const measArrive = spawnTime + Math.max(0, measureX - spawnX);
            const ryLocal = clamp01((clock - ryArrive) / WINDOW);
            const ryProgress = reacting ? ryLocal : state ? 1 : 0;
            const ryFill = p1 * ryProgress;
            const ryFlash = reacting && ryLocal > 0 && ryLocal < 1 ? Math.sin(ryLocal * Math.PI) : 0;
            const resolved = reacting ? clamp01((clock - measArrive) / WINDOW) : collapsed ? 1 : 0;

            const uncertainty = 1 - Math.abs(2 * clamp01(p1) - 1);
            const inSuperposition = reacting ? ryProgress * (1 - resolved) : state && !collapsed ? 1 : 0;
            const bandOpacity = (0.14 + uncertainty * 0.36) * inSuperposition;

            // This qubit's travelling dot + the charged trail it leaves behind.
            const spawned = reacting && clock >= spawnTime;
            const currentX = spawnX + (clock - spawnTime);
            const trailStart = qi === originIndex ? LABEL_W : spawnX;
            const trailEnd = spawned ? Math.min(currentX, measureX) : trailStart;

            return (
              <g
                key={region.id}
                className={onCollapseRegion ? "quantum-circuit-wires__row" : undefined}
                onClick={onCollapseRegion ? () => onCollapseRegion(region.id, region.qubitIndex) : undefined}
              >
                {onCollapseRegion ? (
                  <rect x={0} y={y - ROW_GAP / 2} width={width} height={ROW_GAP} fill="transparent" />
                ) : null}
                <line
                  x1={LABEL_W}
                  y1={y}
                  x2={measureX}
                  y2={y}
                  stroke={isHighlight ? "#b8f4ff" : "#1fbfff"}
                  strokeWidth={1}
                  opacity={isHighlight ? 0.7 : 0.3}
                />
                <text className="quantum-circuit-wires__ket" x={LABEL_W + 1} y={y - 4}>
                  |0⟩
                </text>
                {bandOpacity > 0.01 ? (
                  <g opacity={bandOpacity}>
                    <rect
                      className="quantum-circuit-wires__superpos"
                      x={RY_X + 11}
                      y={y - 3}
                      width={Math.max(0, measureX - 4 - (RY_X + 11))}
                      height={6}
                      rx={3}
                      fill="#7fdcff"
                    />
                  </g>
                ) : null}
                {/* Charged trail behind this qubit's dot */}
                {spawned && trailEnd > trailStart ? (
                  <line x1={trailStart} y1={y} x2={trailEnd} y2={y} stroke="#b8f4ff" strokeWidth={1.8} opacity={0.9} />
                ) : null}
                <text className="quantum-circuit-wires__qlabel" x={0} y={y + 3}>
                  <tspan className="quantum-circuit-wires__qindex" fill={isHighlight ? "#ffffff" : undefined}>
                    {`q${qi}`}
                  </tspan>
                  <tspan dx="4">{shortLabel(region.id)}</tspan>
                </text>

                {/* RY state-prep gate, shaped by the prepared rotation */}
                <g transform={`translate(${RY_X} ${y})`}>
                  <title>{`RY θ=${theta.toFixed(2)} rad · prepares P₁=${pct}%`}</title>
                  <clipPath id={`ry-clip-${qi}`}>
                    <rect x={-9} y={-GATE_H / 2} width={18} height={GATE_H} rx={2.5} />
                  </clipPath>
                  <rect
                    x={-9}
                    y={GATE_H / 2 - GATE_H * ryFill}
                    width={18}
                    height={GATE_H * ryFill}
                    fill="#9beaff"
                    opacity={0.8}
                    clipPath={`url(#ry-clip-${qi})`}
                  />
                  <rect
                    className="quantum-circuit-wires__gate"
                    x={-9}
                    y={-GATE_H / 2}
                    width={18}
                    height={GATE_H}
                    rx={2.5}
                    stroke={ryFlash > 0.4 ? "#ffffff" : undefined}
                    fill="none"
                  />
                  <text className="quantum-circuit-wires__gate-label" textAnchor="middle" dy="2.4">
                    RY
                  </text>
                </g>

                {/* Measurement + resolved bit + probability readout */}
                <g transform={`translate(${measureX} ${y})`}>
                  <title>{`${shortLabel(region.id)} · q${qi} · P₁=${pct}%${state?.measuredBit ? ` · measured ${state.measuredBit}` : ""}`}</title>
                  <rect className="quantum-circuit-wires__meter" x={-2} y={-6} width={16} height={12} rx={2.5} />
                  <path className="quantum-circuit-wires__meter-arc" d="M 1 3 A 5 5 0 0 1 11 3" fill="none" />
                  <line className="quantum-circuit-wires__meter-arc" x1={6} y1={3} x2={9.5} y2={-1.5} />
                  {state?.measuredBit ? (
                    <text
                      className="quantum-circuit-wires__bit"
                      x={19}
                      dy="3"
                      opacity={resolved}
                      fill={state.measuredBit === "1" ? "#9beaff" : "rgba(155,234,255,0.45)"}
                    >
                      {state.measuredBit}
                    </text>
                  ) : null}
                  {resolved < 0.5 ? (
                    <text className="quantum-circuit-wires__bit quantum-circuit-wires__bit--undecided" x={19} dy="3" opacity={1 - resolved * 2}>
                      ?
                    </text>
                  ) : null}
                  {hasState ? (
                    <text className="quantum-circuit-wires__pct" x={29} dy="2.6">
                      {`${pct}%`}
                    </text>
                  ) : null}
                </g>
              </g>
            );
          })}

          {/* RZZ entangling gates — flash when a dot crosses, then stay lit */}
          {gates.map((gate, index) => {
            const x = gateColumnX(gate.column);
            const y1 = wireY(gate.lo);
            const y2 = wireY(gate.hi);
            const strength = Math.max(0, Math.min(1, gate.strength));
            const trigger = propagation.gateTrigger[index];
            const pass = reacting && Number.isFinite(trigger) ? clamp01((clock - trigger) / WINDOW) : 0;
            const flash = pass > 0 && pass < 1 ? Math.sin(pass * Math.PI) : 0;
            const baseOpacity = 0.4 + strength * 0.45;
            // Once a dot has crossed (pass→1) the gate stays alive, not faded.
            const opacity = reacting ? Math.min(1, baseOpacity + pass * (0.92 - baseOpacity) + flash * 0.3) : baseOpacity;
            const stroke = flash > 0.45 ? "#ffffff" : pass > 0.6 ? "#b8f4ff" : "#1fbfff";
            return (
              <g key={`${gate.source}-${gate.target}`} opacity={Math.max(0.05, opacity)}>
                <title>{`RZZ · ${shortLabel(gate.source)} ↔ ${shortLabel(gate.target)} · coupling ${strength.toFixed(2)}`}</title>
                <line x1={x} y1={y1} x2={x} y2={y2} stroke={stroke} strokeWidth={1 + strength * 2.4 + flash * 1.6} strokeLinecap="round" />
                <circle cx={x} cy={y1} r={2.6} fill="#b8f4ff" />
                <circle cx={x} cy={y2} r={2.6} fill="#b8f4ff" />
                <g transform={`translate(${x} ${(y1 + y2) / 2})`}>
                  <rect className="quantum-circuit-wires__zz" x={-11} y={-5.5} width={22} height={11} rx={2.5} stroke={flash > 0.45 || pass > 0.6 ? "#b8f4ff" : undefined} />
                  <text className="quantum-circuit-wires__gate-label" textAnchor="middle" dy="2.2">
                    RZZ
                  </text>
                </g>
              </g>
            );
          })}

          {/* Travelling dots — one per qubit, cascading from the clicked qubit */}
          {reacting
            ? REGIONS.map((region) => {
                const qi = region.qubitIndex;
                const spawnTime = propagation.spawnTime[qi];
                if (clock < spawnTime) return null;
                const cx = propagation.spawnX[qi] + (clock - spawnTime);
                if (cx >= dotEnd) return null;
                const fade = clamp01((dotEnd - cx) / 10);
                return (
                  <g key={`dot-${qi}`} opacity={fade}>
                    <circle cx={cx} cy={wireY(qi)} r={6} fill="#1fbfff" opacity={0.4} />
                    <circle cx={cx} cy={wireY(qi)} r={3} fill="#ffffff" />
                  </g>
                );
              })
            : null}
        </svg>
      </div>

      {distribution ? (
        <div className="quantum-circuit-dist">
          <div className="quantum-circuit-dist__header">
            <span>Measured outcome</span>
            <strong>{distribution.dominant ?? distribution.entries[0]?.[0] ?? "—"}</strong>
          </div>
          {distribution.entries.map(([bitstring, count]) => (
            <div key={bitstring} className="quantum-circuit-dist__row">
              <code>{bitstring}</code>
              <i>
                <span style={{ width: `${Math.max(4, (count / distribution.shots) * 100)}%` }} />
              </i>
              <b>{count}</b>
            </div>
          ))}
        </div>
      ) : null}

      <div className="quantum-circuit-legend">
        <span className="quantum-circuit-legend__item">|0⟩ → RY → ⟨superpos⟩ → RZZ → ⊓</span>
      </div>
    </section>
  );
}
