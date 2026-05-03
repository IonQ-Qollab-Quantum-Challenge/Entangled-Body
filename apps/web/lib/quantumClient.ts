import type { BodyRegion } from "./bodyRegions";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";
const REQUEST_TIMEOUT_MS = 10000;

export type QuantumClientState = {
  loading: boolean;
  error: string | null;
};

export async function getPrecomputed(region: BodyRegion): Promise<unknown> {
  const payload = await requestJson(`${API_BASE}/quantum/precomputed`, { method: "GET" });
  if (!payload || typeof payload !== "object") return payload;
  const samples = (payload as Record<string, unknown>).samples;
  if (samples && typeof samples === "object" && region in samples) {
    return (samples as Record<string, unknown>)[region];
  }
  return payload;
}

export async function measure(region: BodyRegion, intensity = 1, shots = 1024): Promise<unknown> {
  return requestJson(`${API_BASE}/quantum/measure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ region, intensity, shots }),
  });
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
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
