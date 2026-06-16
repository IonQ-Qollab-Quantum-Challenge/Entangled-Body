import bodyRegionMap from "../../api/data/body_region_map.json";
import type { BodyRegion } from "./bodyRegions";
import type { QuantumMeasurementPayload } from "./quantumClient";

export type RegionEntry = {
  id: BodyRegion;
  label: string;
  qubitIndex: number;
  spatialPosition?: [number, number, number];
};

export type CircuitLink = { source: BodyRegion; target: BodyRegion; strength: number };

// Regions ordered by qubit index — matches circuits.py, where each region owns
// one qubit (q0..qN) and the entanglement links become the two-qubit gates.
export const REGIONS: RegionEntry[] = ([...(bodyRegionMap.regions as unknown as RegionEntry[])]).sort(
  (left, right) => left.qubitIndex - right.qubitIndex,
);

export const BASE_LINKS = bodyRegionMap.entanglementLinks as unknown as CircuitLink[];

export const SHORT_LABELS: Partial<Record<BodyRegion, string>> = {
  head: "Head",
  chest: "Chest",
  torso: "Torso",
  oxygenTank: "O₂",
  rightShoulder: "R·Sh",
  leftShoulder: "L·Sh",
  rightArm: "R·Arm",
  leftArm: "L·Arm",
  rightHand: "R·Hand",
  leftHand: "L·Hand",
  rightLeg: "R·Leg",
  leftLeg: "L·Leg",
  rightFoot: "R·Foot",
  leftFoot: "L·Foot",
};

export function shortLabel(region: BodyRegion): string {
  return SHORT_LABELS[region] ?? region;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Merge the live per-measurement correlation strengths over the static link set
// so both views light up with the same data.
export function linksWithStrength(measurement?: QuantumMeasurementPayload | null): CircuitLink[] {
  const live = new Map<string, number>();
  for (const link of measurement?.entanglementLinks ?? []) {
    live.set(pairKey(link.source, link.target), link.strength);
  }
  return BASE_LINKS.map((link) => ({
    source: link.source,
    target: link.target,
    strength: live.get(pairKey(link.source, link.target)) ?? link.strength,
  }));
}
