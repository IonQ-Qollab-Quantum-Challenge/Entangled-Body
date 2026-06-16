import precomputedSamples from "../../api/data/precomputed_samples.json";
import { BODY_REGIONS, type BodyRegion, type QuantumNodeState, type RegionState } from "./bodyRegions";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";
const REQUEST_TIMEOUT_MS = parsePositiveInteger(
  process.env.NEXT_PUBLIC_QUANTUM_REQUEST_TIMEOUT_MS,
  300000,
);
const FALLBACK_ON_HTTP_ERRORS = parseBoolean(
  process.env.NEXT_PUBLIC_QUANTUM_FALLBACK_ON_HTTP_ERRORS,
  false,
);
// IonQ jobs (cloud simulator and QPU) run synchronously on the API: a single
// request blocks until the job resolves and returns the completed result, so no
// polling is normally needed. The polling path below is kept as a safety net in
// case the API ever responds with a pending jobId (e.g. a future async mode).
//
// When polling does kick in we use exponential backoff: start fast so quick jobs
// feel responsive, then grow the interval up to a cap so long QPU queue waits
// don't hammer the API.
const POLL_INITIAL_MS = parsePositiveInteger(
  process.env.NEXT_PUBLIC_QUANTUM_POLL_INITIAL_MS,
  400,
);
const POLL_INTERVAL_MS = parsePositiveInteger(
  process.env.NEXT_PUBLIC_QUANTUM_POLL_INTERVAL_MS,
  3000,
);
const POLL_BACKOFF_FACTOR = 1.6;
const POLL_TIMEOUT_MS = parsePositiveInteger(
  process.env.NEXT_PUBLIC_QUANTUM_POLL_TIMEOUT_MS,
  600000,
);

export type QuantumInteraction = "hover" | "click" | "hold";
export type QuantumBackend = "aer" | "ionq_simulator" | "ionq_hardware";

// Passive/exploratory interactions — hover, node inspection, entangled-state
// refresh — fire frequently (one per hovered region), so they must stay instant
// and free by always running on the local Aer simulator. Submitting these to a
// remote IonQ backend would issue a blocking cloud job per mouse move, saturate
// the browser's per-host connection pool with multi-minute requests, and stall
// (then ECONNRESET) the deliberate collapse. Only the explicit collapse click
// submits to the selected IonQ backend.
export function exploratoryBackend(_backend: QuantumBackend): QuantumBackend {
  return "aer";
}

export type QuantumClientState = {
  loading: boolean;
  error: string | null;
};

export type QuantumMeasurementPayload = {
  backend?: string;
  requestedBackend?: QuantumBackend;
  provider?: string;
  hardware?: boolean;
  status?: "pending" | "completed" | "failed";
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
  shots = 1,
  options: { interaction?: QuantumInteraction; backend?: QuantumBackend; seed?: number } = {},
): Promise<unknown> {
  const safeIntensity = clamp(intensity, 0, 1);
  const safeShots = Math.round(clamp(shots, 1, 8192));
  const safeSeed = typeof options.seed === "number" && Number.isFinite(options.seed) ? Math.max(0, Math.round(options.seed)) : undefined;
  const backend = options.backend ?? "ionq_simulator";
  const requestBody = { region, intensity: safeIntensity, shots: safeShots, interaction: options.interaction, backend, seed: safeSeed };
  const fallback = () =>
    buildLocalMeasurement(region, safeIntensity, safeShots, {
      interaction: options.interaction ?? "click",
      backend,
      seed: safeSeed,
    });

  try {
    const submitted = await requestJson(`${API_BASE}/quantum/measure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    return await waitForQuantumJob(submitted, requestBody, fallback);
  } catch (error) {
    if (shouldUseLocalFallback(error)) return fallback();
    throw error;
  }
}

function isPendingJob(value: unknown): value is { status: "pending"; jobId?: string | null } {
  return Boolean(value) && typeof value === "object" && (value as { status?: string }).status === "pending";
}

async function waitForQuantumJob(
  submitted: unknown,
  requestBody: Record<string, unknown>,
  fallback: () => unknown,
): Promise<unknown> {
  if (!isPendingJob(submitted)) return submitted;
  const jobId = submitted.jobId;
  if (!jobId) return submitted;

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let interval = POLL_INITIAL_MS;
  let current: unknown = submitted;
  while (isPendingJob(current)) {
    if (Date.now() >= deadline) return fallback();
    await delay(interval);
    current = await requestJson(`${API_BASE}/quantum/job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...requestBody, jobId }),
    });
    interval = Math.min(Math.round(interval * POLL_BACKOFF_FACTOR), POLL_INTERVAL_MS);
  }
  return current;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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
  if (isHttpServerResponse(error.message)) return FALLBACK_ON_HTTP_ERRORS;
  return (
    error.message.includes("Failed to fetch") ||
    error.message.includes("Load failed") ||
    error.message.includes("NetworkError") ||
    error.message.includes("socket hang up") ||
    error.message.includes("ECONNRESET") ||
    error.message.includes("Request failed with 404") ||
    error.message.includes("Request failed with 502") ||
    error.message.includes("Request failed with 503") ||
    error.message.includes("Request failed with 504")
  );
}

function isHttpServerResponse(message: string): boolean {
  return (
    message.includes("Request failed with 400") ||
    message.includes("Request failed with 401") ||
    message.includes("Request failed with 403") ||
    message.includes("Request failed with 405") ||
    message.includes("Request failed with 422") ||
    message.includes("Request failed with 500")
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

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
