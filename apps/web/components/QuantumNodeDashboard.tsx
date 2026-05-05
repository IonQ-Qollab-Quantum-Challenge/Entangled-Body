"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { BODY_REGIONS, type BodyRegion, type QuantumNodeState } from "../lib/bodyRegions";
import { getQuantumHealth, measure, type QuantumInteraction, type QuantumMeasurementPayload } from "../lib/quantumClient";

type NodeStatus = "checking" | "online" | "degraded" | "offline";

type QuantumHealth = {
  ok?: boolean;
  mode?: string;
  ionq_configured?: boolean;
};

const REGION_LABELS: Record<BodyRegion, string> = {
  head: "Head",
  torso: "Torso",
  leftArm: "Left Arm",
  rightArm: "Right Arm",
  leftLeg: "Left Leg",
  rightLeg: "Right Leg",
};

type QuantumNodeDashboardProps = {
  latestMeasurement?: QuantumMeasurementPayload | null;
  mode: "superposition" | "collapse";
  collapseProgress: number;
  stableProgress: number;
  modelStable: boolean;
  loading: boolean;
};

export function QuantumNodeDashboard({
  latestMeasurement = null,
  mode,
  collapseProgress,
  stableProgress,
  modelStable,
  loading,
}: QuantumNodeDashboardProps) {
  const [status, setStatus] = useState<NodeStatus>("checking");
  const [health, setHealth] = useState<QuantumHealth | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<BodyRegion>("torso");
  const [interaction, setInteraction] = useState<QuantumInteraction>("click");
  const [shots, setShots] = useState(512);
  const [seed, setSeed] = useState(42);
  const [measurement, setMeasurement] = useState<QuantumMeasurementPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string>("--");

  const refreshHealth = useCallback(async () => {
    try {
      setStatus("checking");
      setError(null);
      const payload = normalizeHealth(await getQuantumHealth());
      setHealth(payload);
      setStatus(payload.ok ? "online" : "degraded");
      setLastChecked(new Date().toLocaleTimeString());
    } catch (requestError) {
      setStatus("offline");
      setHealth(null);
      setError(requestError instanceof Error ? requestError.message : "Quantum node health check failed.");
      setLastChecked(new Date().toLocaleTimeString());
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    if (latestMeasurement) {
      setMeasurement(latestMeasurement);
    }
  }, [latestMeasurement]);

  const runProbe = useCallback(async () => {
    try {
      setBusy(true);
      setError(null);
      const payload = normalizeMeasurement(
        await measure(selectedRegion, interaction === "hover" ? 0.45 : 1, shots, {
          interaction,
          seed,
        }),
      );
      setMeasurement(payload);
      setStatus(payload.source === "fallback" ? "degraded" : "online");
    } catch (requestError) {
      setStatus("offline");
      setError(requestError instanceof Error ? requestError.message : "Quantum node probe failed.");
    } finally {
      setBusy(false);
      setLastChecked(new Date().toLocaleTimeString());
    }
  }, [interaction, seed, selectedRegion, shots]);

  const effectiveMeasurement = measurement ?? latestMeasurement;

  const topCounts = useMemo(() => {
    if (!effectiveMeasurement?.counts) return [];
    return Object.entries(effectiveMeasurement.counts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4);
  }, [effectiveMeasurement]);

  const selectedState = effectiveMeasurement?.regionStates?.[selectedRegion];
  const nodeStates = effectiveMeasurement?.nodeStates ?? [];
  const sceneProgress = mode === "collapse" ? collapseProgress : stableProgress;
  const sceneStatus = loading ? "measuring" : modelStable ? "stabilizing" : "ready";

  return (
    <aside className="quantum-dashboard" aria-label="Quantum node dashboard">
      <header className="quantum-dashboard__header">
        <div>
          <div className="quantum-dashboard__eyebrow">Quantum Node</div>
          <h2>Node Inspector</h2>
        </div>
        <StatusPill status={status} />
      </header>

      <section className="quantum-dashboard__scene-status" aria-label="Scene quantum status">
        <div className="quantum-dashboard__scene-status-header">
          <span>{mode}</span>
          <strong>{sceneStatus}</strong>
        </div>
        <div className="quantum-dashboard__progress">
          <i style={{ width: `${Math.round(sceneProgress * 100)}%` }} />
        </div>
        <div className="quantum-dashboard__scene-status-footer">
          <span>{mode === "collapse" ? "collapse" : "stability"}</span>
          <b>{Math.round(sceneProgress * 100)}%</b>
        </div>
      </section>

      <section className="quantum-dashboard__grid">
        <Metric label="Mode" value={health?.mode ?? "--"} />
        <Metric label="IonQ" value={health?.ionq_configured ? "Configured" : "Simulator"} />
        <Metric label="Qubits" value={String(effectiveMeasurement?.qubits ?? 6)} />
        <Metric label="Last Check" value={lastChecked} />
      </section>

      <div className="quantum-dashboard__controls">
        <label>
          Region
          <select value={selectedRegion} onChange={(event) => setSelectedRegion(event.target.value as BodyRegion)}>
            {BODY_REGIONS.map((region) => (
              <option key={region} value={region}>
                {REGION_LABELS[region]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Event
          <select value={interaction} onChange={(event) => setInteraction(event.target.value as QuantumInteraction)}>
            <option value="hover">Hover</option>
            <option value="click">Click</option>
            <option value="hold">Hold</option>
          </select>
        </label>

        <label>
          Shots
          <input type="number" min={32} max={8192} step={32} value={shots} onChange={(event) => setShots(Number(event.target.value))} />
        </label>

        <label>
          Seed
          <input type="number" min={0} value={seed} onChange={(event) => setSeed(Number(event.target.value))} />
        </label>
      </div>

      <div className="quantum-dashboard__actions">
        <button type="button" onClick={refreshHealth} disabled={busy}>
          Check
        </button>
        <button type="button" onClick={runProbe} disabled={busy}>
          {busy ? "Running" : "Probe"}
        </button>
      </div>

      {error ? <div className="quantum-dashboard__error">{error}</div> : null}

      <section className="quantum-dashboard__result">
        <div className="quantum-dashboard__result-header">
          <span>Dominant</span>
          <strong>{effectiveMeasurement?.dominantBitstring ?? "------"}</strong>
        </div>
        <div className="quantum-dashboard__bars">
          {topCounts.length > 0 ? (
            topCounts.map(([bitstring, count]) => (
              <div key={bitstring} className="quantum-dashboard__bar-row">
                <span>{bitstring}</span>
                <div>
                  <i style={{ width: `${Math.max(4, (count / Math.max(1, effectiveMeasurement?.shots ?? count)) * 100)}%` }} />
                </div>
                <b>{count}</b>
              </div>
            ))
          ) : (
            <div className="quantum-dashboard__empty">No probe data</div>
          )}
        </div>
      </section>

      <section className="quantum-dashboard__state">
        <Metric label="Activation" value={formatStateValue(selectedState?.activation)} />
        <Metric label="Coherence" value={formatStateValue(selectedState?.coherence)} />
        <Metric label="Displace" value={formatStateValue(selectedState?.displacement)} />
        <Metric label="Links" value={String(effectiveMeasurement?.entanglementLinks?.length ?? 0)} />
      </section>

      <NodeStateList nodeStates={nodeStates} />

      {effectiveMeasurement?.fallbackReason ? <div className="quantum-dashboard__warning">Fallback: {effectiveMeasurement.fallbackReason}</div> : null}
    </aside>
  );
}

function StatusPill({ status }: { status: NodeStatus }) {
  return <span className={`quantum-dashboard__status quantum-dashboard__status--${status}`}>{status}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="quantum-dashboard__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function normalizeHealth(payload: unknown): QuantumHealth {
  if (!payload || typeof payload !== "object") return {};
  return payload as QuantumHealth;
}

function normalizeMeasurement(payload: unknown): QuantumMeasurementPayload {
  if (!payload || typeof payload !== "object") return {};
  return payload as QuantumMeasurementPayload;
}

function formatStateValue(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "--";
}

function NodeStateList({ nodeStates }: { nodeStates: QuantumNodeState[] }) {
  return (
    <section className="quantum-dashboard__nodes">
      <div className="quantum-dashboard__section-title">Node States</div>
      {nodeStates.length > 0 ? (
        nodeStates.map((node) => (
          <div key={node.region} className="quantum-dashboard__node-row">
            <span>{REGION_LABELS[node.region]}</span>
            <b>{node.measuredBit}</b>
            <i>{node.collapsed ? "collapsed" : "superposed"}</i>
          </div>
        ))
      ) : (
        <div className="quantum-dashboard__empty">No node states</div>
      )}
    </section>
  );
}
