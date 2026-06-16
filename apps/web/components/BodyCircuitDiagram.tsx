"use client";

import { useMemo } from "react";

import type { BodyRegion, QuantumNodeState } from "../lib/bodyRegions";
import type { QuantumMeasurementPayload } from "../lib/quantumClient";
import { linksWithStrength, REGIONS, SHORT_LABELS } from "../lib/quantumCircuitData";

// The body network is a 3D point cloud (region spatialPosition). We render a
// front view: horizontal = x, vertical = y, with a small z skew so back-of-body
// nodes (e.g. the oxygen tank) don't collapse onto the spine line.
const VIEW_W = 240;
const VIEW_H = 348;
const PAD_X = 30;
const PAD_TOP = 24;
const PAD_BOTTOM = 30;
const Z_SKEW = 0.22;

type Point = { x: number; y: number; label: string; qubitIndex: number };

// Project once at module load; the layout only depends on the static region map.
const NODE_POINTS: Record<string, Point> = (() => {
  const projected = REGIONS.map((region) => {
    const [x, y, z] = region.spatialPosition ?? [0, 0, 0];
    return { id: region.id, label: region.label, qubitIndex: region.qubitIndex, px: x + z * Z_SKEW, py: y };
  });
  const xs = projected.map((entry) => entry.px);
  const ys = projected.map((entry) => entry.py);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1e-3, maxX - minX);
  const spanY = Math.max(1e-3, maxY - minY);

  const result: Record<string, Point> = {};
  for (const entry of projected) {
    result[entry.id] = {
      x: PAD_X + ((entry.px - minX) / spanX) * (VIEW_W - PAD_X * 2),
      y: PAD_TOP + (1 - (entry.py - minY) / spanY) * (VIEW_H - PAD_TOP - PAD_BOTTOM),
      label: SHORT_LABELS[entry.id] ?? entry.label,
      qubitIndex: entry.qubitIndex,
    };
  }
  return result;
})();

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

// Largest node-to-node distance in the layout — used to normalise how far the
// collapse wavefront has to travel from the observed node to the rest of the body.
const MAX_LAYOUT_SPAN = (() => {
  const points = Object.values(NODE_POINTS);
  let max = 1;
  for (const a of points) {
    for (const b of points) {
      max = Math.max(max, distance(a.x, a.y, b.x, b.y));
    }
  }
  return max;
})();

// Per-element collapse: the break starts near the observed node and ripples
// outward, so closer links/nodes snap first. `delay` is the share of the
// collapse the wavefront spends reaching this element.
function staggeredCollapse(collapse: number, originX: number, originY: number, x: number, y: number): number {
  const delay = (distance(originX, originY, x, y) / MAX_LAYOUT_SPAN) * 0.55;
  return clamp01((collapse - delay) / Math.max(0.001, 1 - delay));
}

type DiagramProps = {
  measurement?: QuantumMeasurementPayload | null;
  highlightRegion?: BodyRegion | null;
  mode: "superposition" | "collapse";
  collapseProgress: number;
  loading?: boolean;
  onCollapseRegion?: (region: BodyRegion, qubitIndex: number) => void;
};

export function BodyCircuitDiagram({ measurement, highlightRegion = null, mode, collapseProgress, loading = false, onCollapseRegion }: DiagramProps) {
  const links = useMemo(
    () => linksWithStrength(measurement).filter((link) => NODE_POINTS[link.source] && NODE_POINTS[link.target]),
    [measurement],
  );

  const nodeStateByRegion = useMemo(() => {
    const map = new Map<string, QuantumNodeState>();
    for (const node of measurement?.nodeStates ?? []) {
      map.set(node.region, node);
    }
    return map;
  }, [measurement]);

  // Drive the whole animation from the collapse progress. 0 = fully entangled
  // superposition; 1 = measured, entanglement severed.
  const collapse = mode === "collapse" ? clamp01(collapseProgress) : 0;
  const hasMeasurement = Boolean(measurement?.nodeStates?.length);
  const collapsing = mode === "collapse" && collapse > 0.001;

  // The collapse radiates from the observed node (falls back to the body centre).
  const origin = (highlightRegion && NODE_POINTS[highlightRegion]) || NODE_POINTS.torso || { x: VIEW_W / 2, y: VIEW_H / 2 };
  const rippleRadius = collapse * MAX_LAYOUT_SPAN * 1.15;

  return (
    <section className="quantum-dashboard__circuit" aria-label="Body-shaped quantum circuit diagram">
      <div className="quantum-dashboard__section-title">
        Entangled Body Circuit · {REGIONS.length} qubits
      </div>
      <svg
        className={`quantum-circuit-svg${loading ? " quantum-circuit-svg--measuring" : ""}`}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`Quantum network of ${REGIONS.length} body nodes connected by entanglement links`}
      >
        <g className="quantum-circuit-svg__links">
          {links.map((link) => {
            const a = NODE_POINTS[link.source];
            const b = NODE_POINTS[link.target];
            const strength = Math.max(0, Math.min(1, link.strength));
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            // How broken this link is, rippling outward from the observed node.
            const broke = collapsing ? staggeredCollapse(collapse, origin.x, origin.y, midX, midY) : 0;
            // Each half retracts from the centre toward its endpoint, tearing a
            // growing gap in the middle until the link disappears.
            const innerAX = lerp(a.x, midX, 1 - broke);
            const innerAY = lerp(a.y, midY, 1 - broke);
            const innerBX = lerp(b.x, midX, 1 - broke);
            const innerBY = lerp(b.y, midY, 1 - broke);
            const fade = 1 - broke;
            // A brief brightening flash as a link snaps, peaking mid-break.
            const snap = broke > 0 && broke < 1 ? Math.sin(broke * Math.PI) : 0;
            return (
              <g key={`${link.source}-${link.target}`}>
                {[
                  [a.x, a.y, innerAX, innerAY],
                  [b.x, b.y, innerBX, innerBY],
                ].map(([x1, y1, x2, y2], half) => (
                  <g key={half}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#1fbfff"
                      strokeWidth={1 + strength * 3}
                      strokeLinecap="round"
                      opacity={(0.16 + strength * 0.3) * fade}
                    />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={snap > 0.4 ? "#ffffff" : "#b8f4ff"}
                      strokeWidth={0.5 + strength * 1.2 + snap * 1.4}
                      strokeLinecap="round"
                      opacity={Math.min(1, (0.3 + strength * 0.5) * fade + snap * 0.5)}
                    />
                  </g>
                ))}
              </g>
            );
          })}
        </g>

        {collapsing ? (
          <circle
            cx={origin.x}
            cy={origin.y}
            r={rippleRadius}
            fill="none"
            stroke="#b8f4ff"
            strokeWidth={1.4}
            opacity={(1 - collapse) * 0.55}
          />
        ) : null}

        <g className="quantum-circuit-svg__nodes">
          {Object.entries(NODE_POINTS).map(([region, point]) => {
            const state = nodeStateByRegion.get(region);
            const measuredBit = state?.measuredBit;
            const activation = state?.activation ?? 0;
            const isOne = measuredBit === "1";
            const isHighlight = highlightRegion === region;
            // resolve: 0 = undecided superposition, 1 = collapsed to its bit.
            // During a live collapse it follows the same outward-rippling front
            // as the links. At rest a node only reads "resolved" if it was
            // actually collapsed (click/hold); hover/inspect are weak
            // observations that leave the node in superposition.
            const resolve = collapsing
              ? staggeredCollapse(collapse, origin.x, origin.y, point.x, point.y)
              : state?.collapsed
                ? 1
                : 0;
            const snap = resolve > 0 && resolve < 1 ? Math.sin(resolve * Math.PI) : 0;
            const glowRadius = lerp(8, isOne ? 7 + activation * 7 : 5, resolve);
            const glowOpacity = lerp(0.18, isOne ? 0.12 + activation * 0.26 : 0.05, resolve);
            const coreOpacity = isOne ? lerp(0.5, 1, resolve) : lerp(0.5, 0.18, resolve);

            return (
              <g
                key={region}
                className={onCollapseRegion ? "quantum-circuit-svg__node--clickable" : undefined}
                transform={`translate(${point.x} ${point.y})`}
                onClick={onCollapseRegion ? () => onCollapseRegion(region as BodyRegion, point.qubitIndex) : undefined}
              >
                <title>
                  {`${point.label} · qubit ${point.qubitIndex}`}
                  {state ? ` · bit ${state.measuredBit} · p=${state.probability.toFixed(2)}` : ""}
                </title>
                {onCollapseRegion ? <circle r={13} fill="transparent" /> : null}
                {isHighlight && resolve < 1 ? (
                  <circle className="quantum-circuit-svg__pulse" r={12} fill="none" stroke="#b8f4ff" strokeWidth={1.4} />
                ) : null}
                <circle r={glowRadius} fill="#1fbfff" opacity={glowOpacity} />
                <circle
                  r={lerp(5, isOne ? 5.4 : 4, resolve)}
                  fill="#9beaff"
                  fillOpacity={coreOpacity}
                  stroke={snap > 0.5 ? "#ffffff" : isHighlight ? "#ffffff" : "#1fbfff"}
                  strokeWidth={isHighlight ? 1.6 : 1 + snap}
                />
                {hasMeasurement && measuredBit ? (
                  <text className="quantum-circuit-svg__bit" textAnchor="middle" dy="2.6" opacity={resolve}>
                    {measuredBit}
                  </text>
                ) : null}
                <text className="quantum-circuit-svg__label" textAnchor="middle" y={-glowRadius - 3}>
                  {point.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="quantum-circuit-legend">
        <span className="quantum-circuit-legend__item">
          <i className="quantum-circuit-legend__dot quantum-circuit-legend__dot--one" /> bit 1
        </span>
        <span className="quantum-circuit-legend__item">
          <i className="quantum-circuit-legend__dot quantum-circuit-legend__dot--zero" /> bit 0
        </span>
        <span className="quantum-circuit-legend__item">
          <i className="quantum-circuit-legend__line" /> entanglement
        </span>
      </div>
    </section>
  );
}
