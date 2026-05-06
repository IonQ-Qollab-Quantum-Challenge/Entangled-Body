"use client";

import type { BodyQuantumState, BodyRegion, QuantumNodeState } from "../lib/bodyRegions";

type QuantumNodeOverlayProps = {
  quantumState: BodyQuantumState;
  hoveredRegion: BodyRegion | null;
  loading: boolean;
  onHoverRegion: (region: BodyRegion | null) => void;
  onMeasureRegion: (region: BodyRegion) => void;
};

type NodeLayout = {
  region: BodyRegion;
  label: string;
  x: number;
  y: number;
};

const NODE_LAYOUT: NodeLayout[] = [
  { region: "head", label: "Head", x: 50, y: 18 },
  { region: "torso", label: "Torso", x: 50, y: 42 },
  { region: "leftArm", label: "L Arm", x: 30, y: 42 },
  { region: "rightArm", label: "R Arm", x: 70, y: 42 },
  { region: "leftLeg", label: "L Leg", x: 42, y: 72 },
  { region: "rightLeg", label: "R Leg", x: 58, y: 72 },
];

export function QuantumNodeOverlay({
  quantumState,
  hoveredRegion,
  loading,
  onHoverRegion,
  onMeasureRegion,
}: QuantumNodeOverlayProps) {
  const nodesByRegion = new Map(quantumState.nodeStates.map((node) => [node.region, node]));

  return (
    <div className="quantum-node-overlay" aria-label="Entangled quantum node overlay">
      <svg className="quantum-node-overlay__links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {quantumState.entanglementLinks.map((link) => {
          const source = NODE_LAYOUT.find((item) => item.region === link.source);
          const target = NODE_LAYOUT.find((item) => item.region === link.target);
          if (!source || !target) return null;
          const opacity = 0.18 + Math.min(0.62, link.strength * 0.7);
          const width = 0.35 + link.strength * 1.4;
          return (
            <line
              key={`${link.source}-${link.target}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="rgba(133, 241, 189, 0.88)"
              strokeOpacity={opacity}
              strokeWidth={width}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      {NODE_LAYOUT.map((layout) => {
        const node = nodesByRegion.get(layout.region);
        return (
          <button
            key={layout.region}
            type="button"
            className={nodeClassName(layout.region, hoveredRegion, node)}
            style={{
              left: `${layout.x}%`,
              top: `${layout.y}%`,
              transform: `translate(-50%, -50%) scale(${nodeScale(node)})`,
            }}
            disabled={loading}
            onPointerEnter={() => onHoverRegion(layout.region)}
            onPointerLeave={() => onHoverRegion(null)}
            onClick={() => onMeasureRegion(layout.region)}
            aria-label={`${layout.label} quantum node`}
          >
            <span className="quantum-node-overlay__bit">{node?.measuredBit ?? "-"}</span>
            <span className="quantum-node-overlay__label">{layout.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function nodeClassName(region: BodyRegion, hoveredRegion: BodyRegion | null, node: QuantumNodeState | undefined): string {
  return [
    "quantum-node-overlay__node",
    hoveredRegion === region ? "quantum-node-overlay__node--hovered" : "",
    node?.collapsed ? "quantum-node-overlay__node--collapsed" : "",
    node?.measuredBit === "1" ? "quantum-node-overlay__node--one" : "quantum-node-overlay__node--zero",
  ]
    .filter(Boolean)
    .join(" ");
}

function nodeScale(node: QuantumNodeState | undefined): number {
  if (!node) return 1;
  return 0.92 + node.activation * 0.32;
}
