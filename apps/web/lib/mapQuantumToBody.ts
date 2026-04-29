import { BODY_REGIONS, type BodyQuantumState, type BodyRegion, type EntanglementLink, type RegionState, emptyRegionStates, isBodyRegion } from "./bodyRegions";

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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampSigned(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}
