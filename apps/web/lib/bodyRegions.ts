import type { Vector3Tuple } from "three";

export const BODY_REGIONS = ["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"] as const;

export type BodyRegion = (typeof BODY_REGIONS)[number];

export type RegionState = {
  activation: number;
  coherence: number;
  displacement: number;
};

export type EntanglementLink = {
  source: BodyRegion;
  target: BodyRegion;
  strength: number;
};

export type QuantumNodeState = {
  region: BodyRegion;
  qubitIndex: number;
  measuredBit: "0" | "1";
  probability: number;
  activation: number;
  coherence: number;
  collapsed: boolean;
};

export type TileState = {
  currentPosition: Vector3Tuple;
  targetPosition: Vector3Tuple;
  scatteredPosition: Vector3Tuple;
  region: BodyRegion;
  activation: number;
  coherence: number;
  displacement: number;
  collapseProgress: number;
};

export type BodyQuantumState = {
  regionStates: Record<BodyRegion, RegionState>;
  entanglementLinks: EntanglementLink[];
  nodeStates: QuantumNodeState[];
};

export function emptyRegionStates(): Record<BodyRegion, RegionState> {
  return BODY_REGIONS.reduce(
    (states, region) => {
      states[region] = { activation: 0, coherence: 0.18, displacement: 0 };
      return states;
    },
    {} as Record<BodyRegion, RegionState>,
  );
}

export function isBodyRegion(value: string): value is BodyRegion {
  return BODY_REGIONS.includes(value as BodyRegion);
}

export function normalizeRegionName(name: string): BodyRegion | null {
  const normalized = name.toLowerCase();
  if (normalized.includes("head") || normalized.includes("helmet")) return "head";
  if (normalized.includes("torso") || normalized.includes("spine") || normalized.includes("chest")) return "torso";
  if (normalized.includes("left") && (normalized.includes("arm") || normalized.includes("hand"))) return "leftArm";
  if (normalized.includes("right") && (normalized.includes("arm") || normalized.includes("hand"))) return "rightArm";
  if (normalized.includes("left") && (normalized.includes("leg") || normalized.includes("foot"))) return "leftLeg";
  if (normalized.includes("right") && (normalized.includes("leg") || normalized.includes("foot"))) return "rightLeg";
  return null;
}

export function regionFromSpatialPosition(x: number, y: number, minY: number, maxY: number): BodyRegion {
  const height = Math.max(0.001, maxY - minY);
  const normalizedY = (y - minY) / height;

  if (normalizedY > 0.78) return "head";
  if (normalizedY > 0.47) {
    if (x < -0.38) return "rightArm";
    if (x > 0.38) return "leftArm";
    return "torso";
  }

  return x < 0 ? "rightLeg" : "leftLeg";
}
