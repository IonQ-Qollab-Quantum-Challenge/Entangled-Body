import precomputedSamples from "../../api/data/precomputed_samples.json";
import { BODY_REGIONS, type BodyRegion, type QuantumNodeState, type RegionState } from "./bodyRegions";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";
const REQUEST_TIMEOUT_MS = 60000;

export type QuantumInteraction = "hover" | "click" | "hold";
export type QuantumBackend = "aer" | "ionq_simulator" | "ionq_hardware";

export type QuantumClientState = {
  loading: boolean;
  error: string | null;
};

export type QuantumMeasurementPayload = {
  backend?: string;
  requestedBackend?: QuantumBackend;
  provider?: string;
  hardware?: boolean;
  jobId?: string | null;
  jobStatus?: string | null;
  circuitType?: string;
  analysisVersion?: number;
  counts?: Record<string, number>;
  probabilities?: Record<string, number>;
  marginals?: Partial<Record<BodyRegion, { p0: number; p1: number; expectationZ: number; entropy: number }>>;
  correlations?: Array<{ source: BodyRegion; target: BodyRegion; zz: number; mutualInformation: number }>;
  dominantBitstring?: string;
  shots?: number;
  qubits?: number;
  source?: string;
  fallbackReason?: string;
  region?: BodyRegion;
  regionStates?: Partial<Record<BodyRegion, RegionState>>;
  entanglementLinks?: Array<{ source: BodyRegion; target: BodyRegion; strength: number }>;
  nodeStates?: QuantumNodeState[];
};

export async function getQuantumHealth(): Promise<unknown> {
  try {
    return await requestJson(`${API_BASE}/quantum/health`, { method: "GET" });
  } catch (error) {
    if (shouldUseLocalFallback(error)) {
      return {
        ok: true,
        mode: "local-fallback",
        provider: "precomputed",
        fallbackReason: getFallbackReason(error),
      };
    }
    throw error;
  }
}

export async function getPrecomputed(region: BodyRegion): Promise<unknown> {
  const payload = await requestJsonWithFallback(
    `${API_BASE}/quantum/precomputed`,
    { method: "GET" },
    () => getLocalPrecomputed(region),
  );
  if (!payload || typeof payload !== "object") return payload;
  const samples = (payload as Record<string, unknown>).samples;
  if (samples && typeof samples === "object" && region in samples) {
    return (samples as Record<string, unknown>)[region];
  }
  return payload;
}

export async function measure(
  region: BodyRegion,
  intensity = 1,
  shots = 1024,
  options: { interaction?: QuantumInteraction; backend?: QuantumBackend; seed?: number } = {},
): Promise<unknown> {
  const safeIntensity = clamp(intensity, 0, 1);
  const safeShots = Math.round(clamp(shots, 1, 8192));
  const safeSeed = typeof options.seed === "number" && Number.isFinite(options.seed) ? Math.max(0, Math.round(options.seed)) : undefined;
  return requestJsonWithFallback(
    `${API_BASE}/quantum/measure`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region, intensity: safeIntensity, shots: safeShots, interaction: options.interaction, backend: options.backend ?? "ionq_hardware", seed: safeSeed }),
    },
    () => buildLocalMeasurement(region, safeIntensity, safeShots, {
      interaction: options.interaction ?? "click",
      backend: options.backend ?? "ionq_hardware",
      seed: safeSeed,
    }),
  );
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail ? `Request failed with ${response.status}: ${detail}` : `Request failed with ${response.status}`);
    }
    return response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Quantum request timed out.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function requestJsonWithFallback(url: string, init: RequestInit, fallback: (error: unknown) => unknown): Promise<unknown> {
  try {
    return await requestJson(url, init);
  } catch (error) {
    if (shouldUseLocalFallback(error)) return fallback(error);
    throw error;
  }
}

function shouldUseLocalFallback(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Failed to fetch") ||
    error.message.includes("Load failed") ||
    error.message.includes("NetworkError") ||
    error.message.includes("Request failed with 404") ||
    error.message.includes("Request failed with 403") ||
    error.message.includes("Request failed with 405")
  );
}

function getFallbackReason(error: unknown): string {
  return error instanceof Error ? error.message : "Quantum API unavailable.";
}

function getLocalPrecomputed(region: BodyRegion): QuantumMeasurementPayload {
  const samples = (precomputedSamples as { samples?: Partial<Record<BodyRegion, QuantumMeasurementPayload>> }).samples ?? {};
  const sample = samples[region] ?? samples.torso ?? {};
  return {
    ...sample,
    source: "local-fallback",
    fallbackReason: "Quantum API unavailable; using bundled precomputed sample.",
    region,
  };
}

function buildLocalMeasurement(
  region: BodyRegion,
  intensity: number,
  shots: number,
  options: { interaction: QuantumInteraction; backend: QuantumBackend; seed?: number },
): QuantumMeasurementPayload {
  const base = getLocalPrecomputed(region);
  const seed = options.seed ?? Math.round(intensity * 1000) + region.length * 17 + shots;
  const selectedIndex = BODY_REGIONS.indexOf(region);
  const dominantBitstring = BODY_REGIONS.map((item, index) => {
    const baseBit = index === selectedIndex || seededValue(seed, index) > 0.58 ? "1" : "0";
    return options.interaction === "hold" && index === selectedIndex ? "1" : baseBit;
  }).join("");
  const secondaryBitstring = dominantBitstring
    .split("")
    .map((bit, index) => (index === selectedIndex ? (bit === "1" ? "0" : "1") : bit))
    .join("");
  const dominantCount = Math.max(1, Math.round(shots * (0.56 + intensity * 0.18)));
  const secondaryCount = Math.max(0, shots - dominantCount);
  const collapsed = options.interaction === "hold" || intensity > 0.75;
  const regionStates = buildLocalRegionStates(region, intensity, collapsed);
  const nodeStates: QuantumNodeState[] = BODY_REGIONS.map((item, index) => {
    const active = item === region;
    const probability = clamp(active ? 0.62 + intensity * 0.28 : 0.28 + seededValue(seed, index) * 0.42, 0, 1);
    return {
      region: item,
      qubitIndex: index,
      measuredBit: dominantBitstring[index] === "1" ? "1" : "0",
      probability,
      activation: regionStates[item].activation,
      coherence: regionStates[item].coherence,
      collapsed,
    };
  });

  return {
    ...base,
    requestedBackend: options.backend,
    backend: "local-fallback",
    provider: "precomputed",
    hardware: false,
    circuitType: "local_probe",
    analysisVersion: 1,
    counts: { [dominantBitstring]: dominantCount, [secondaryBitstring]: secondaryCount },
    dominantBitstring,
    shots,
    qubits: BODY_REGIONS.length,
    source: "local-fallback",
    fallbackReason: "Quantum API unavailable; using bundled local measurement.",
    region,
    regionStates,
    nodeStates,
  };
}

function buildLocalRegionStates(region: BodyRegion, intensity: number, collapsed: boolean): Record<BodyRegion, RegionState> {
  return BODY_REGIONS.reduce(
    (states, item, index) => {
      const active = item === region;
      states[item] = {
        activation: clamp(active ? 0.52 + intensity * 0.38 : 0.12 + seededValue(region.length, index) * 0.18, 0, 1),
        coherence: clamp(active ? (collapsed ? 0.42 : 0.72) : 0.24 + seededValue(index, region.length) * 0.2, 0, 1),
        displacement: active ? (collapsed ? 0.22 : 0.1) : 0,
      };
      return states;
    },
    {} as Record<BodyRegion, RegionState>,
  );
}

function seededValue(seed: number, index: number): number {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
