import {
  BODY_REGIONS,
  type BodyQuantumState,
  type BodyRegion,
  type EntanglementLink,
  type QuantumNodeState,
  type RegionState,
  emptyRegionStates,
  isBodyRegion,
} from "./bodyRegions";

type RawRegionState = Partial<Record<BodyRegion, Partial<RegionState>>>;

export function mapQuantumToBody(payload: unknown): BodyQuantumState {
  const base = emptyRegionStates();
  const source = extractRegionStates(payload);

  for (const region of BODY_REGIONS) {
    const incoming = source[region];
    if (!incoming) continue;
    base[region] = {
      activation: clamp01(incoming.activation ?? base[region].activation),
      coherence: clamp01(incoming.coherence ?? base[region].coherence),
      displacement: clampSigned(incoming.displacement ?? base[region].displacement),
    };
  }

  return {
    regionStates: base,
    entanglementLinks: extractLinks(payload),
    nodeStates: extractNodeStates(payload),
  };
}

function extractRegionStates(payload: unknown): RawRegionState {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as Record<string, unknown>;

  if (record.regionStates && typeof record.regionStates === "object") {
    return record.regionStates as RawRegionState;
  }

  if (record.samples && typeof record.samples === "object") {
    const first = Object.values(record.samples as Record<string, unknown>)[0];
    return extractRegionStates(first);
  }

  return {};
}

function extractLinks(payload: unknown): EntanglementLink[] {
  if (!payload || typeof payload !== "object") return [];
  const links = (payload as Record<string, unknown>).entanglementLinks;
  if (!Array.isArray(links)) return [];

  return links.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const link = item as Record<string, unknown>;
    if (typeof link.source !== "string" || typeof link.target !== "string") return [];
    if (!isBodyRegion(link.source) || !isBodyRegion(link.target)) return [];
    return [{ source: link.source, target: link.target, strength: clamp01(Number(link.strength ?? 0)) }];
  });
}

function extractNodeStates(payload: unknown): QuantumNodeState[] {
  if (!payload || typeof payload !== "object") return [];
  const nodes = (payload as Record<string, unknown>).nodeStates;
  if (!Array.isArray(nodes)) return [];

  return nodes.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const node = item as Record<string, unknown>;
    if (typeof node.region !== "string" || !isBodyRegion(node.region)) return [];
    const measuredBit = node.measuredBit === "1" ? "1" : "0";
    return [
      {
        region: node.region,
        qubitIndex: Number(node.qubitIndex ?? 0),
        measuredBit,
        probability: clamp01(Number(node.probability ?? 0)),
        activation: clamp01(Number(node.activation ?? 0)),
        coherence: clamp01(Number(node.coherence ?? 0)),
        collapsed: Boolean(node.collapsed),
      },
    ];
  });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampSigned(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}
