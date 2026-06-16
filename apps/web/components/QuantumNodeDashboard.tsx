"use client";

import { useCallback, useEffect, useState } from "react";

import { BodyCircuitDiagram } from "./BodyCircuitDiagram";
import { QubitCircuitDiagram } from "./QubitCircuitDiagram";
import type { BodyRegion } from "../lib/bodyRegions";
import { getQuantumHealth, type QuantumBackend, type QuantumMeasurementPayload } from "../lib/quantumClient";

type NodeStatus = "checking" | "online" | "degraded" | "offline";

type CircuitView = "body" | "circuit";

type QuantumHealth = {
  ok?: boolean;
  mode?: string;
  ionq_configured?: boolean;
  ionq_hardware_enabled?: boolean;
  default_backend?: string;
  available_backends?: QuantumBackend[];
};

const REGION_LABELS: Partial<Record<BodyRegion, string>> = {
  head: "Head",
  chest: "Chest",
  torso: "Torso",
  oxygenTank: "Oxygen Tank",
  rightShoulder: "Right Shoulder",
  leftShoulder: "Left Shoulder",
  rightArm: "Right Arm",
  leftArm: "Left Arm",
  rightHand: "Right Hand",
  leftHand: "Left Hand",
  rightLeg: "Right Leg",
  leftLeg: "Left Leg",
  rightFoot: "Right Foot",
  leftFoot: "Left Foot",
};

type InspectedNode = {
  index: number;
  qubitIndex: number;
  region: BodyRegion;
};

type QuantumNodeDashboardProps = {
  latestMeasurement?: QuantumMeasurementPayload | null;
  appMode: "inspect" | "measurement";
  visible: boolean;
  mode: "superposition" | "collapse";
  collapseProgress: number;
  stableProgress: number;
  modelStable: boolean;
  loading: boolean;
  inspectedNode: InspectedNode | null;
  backend: QuantumBackend;
  onBackendChange: (backend: QuantumBackend) => void;
  onCollapseRegion?: (region: BodyRegion, qubitIndex: number) => void;
};

export function QuantumNodeDashboard({
  latestMeasurement = null,
  appMode,
  visible,
  mode,
  collapseProgress,
  stableProgress,
  modelStable,
  loading,
  inspectedNode,
  backend,
  onBackendChange,
  onCollapseRegion,
}: QuantumNodeDashboardProps) {
  const [status, setStatus] = useState<NodeStatus>("checking");
  const [health, setHealth] = useState<QuantumHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [circuitView, setCircuitView] = useState<CircuitView>("body");
  const hasInspectedNode = inspectedNode !== null;
  const targetVisible = visible && (appMode !== "inspect" || hasInspectedNode);
  const [renderDashboard, setRenderDashboard] = useState(targetVisible);
  const [animateDashboard, setAnimateDashboard] = useState(targetVisible);

  const refreshHealth = useCallback(async () => {
    try {
      setStatus("checking");
      setError(null);
      const payload = normalizeHealth(await getQuantumHealth());
      setHealth(payload);
      setStatus(payload.ok ? "online" : "degraded");
    } catch (requestError) {
      setStatus("offline");
      setHealth(null);
      setError(requestError instanceof Error ? requestError.message : "Quantum node health check failed.");
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    if (targetVisible) {
      setRenderDashboard(true);
      let secondFrame = 0;
      const firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setAnimateDashboard(true));
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(secondFrame);
      };
    }

    setAnimateDashboard(false);
    const timeout = window.setTimeout(() => setRenderDashboard(false), 340);
    return () => window.clearTimeout(timeout);
  }, [targetVisible]);

  const effectiveMeasurement = latestMeasurement;
  const highlightRegion: BodyRegion | null =
    appMode === "inspect" ? inspectedNode?.region ?? null : effectiveMeasurement?.region ?? null;
  const sceneProgress = mode === "collapse" ? collapseProgress : stableProgress;
  const sceneStatus = loading ? "measuring" : modelStable ? "stabilizing" : "ready";

  const eyebrow = appMode === "inspect" ? "Local Observation" : "Global Collapse";
  const title =
    appMode === "inspect"
      ? `${REGION_LABELS[inspectedNode?.region ?? "torso"] ?? "Quantum"} Node`
      : "Entangled Body Field";

  if (!renderDashboard) return null;

  return (
    <aside
      className={`quantum-dashboard quantum-dashboard--${appMode} ${
        animateDashboard ? "quantum-dashboard--visible" : "quantum-dashboard--hidden"
      }`}
      aria-hidden={!animateDashboard}
      aria-label="Quantum node dashboard"
    >
      <header className="quantum-dashboard__header">
        <div>
          <div className="quantum-dashboard__eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
        </div>
        <StatusPill status={status} />
      </header>

      {appMode === "measurement" ? (
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
      ) : null}

      <BackendSelector backend={backend} onBackendChange={onBackendChange} />

      <CircuitViewToggle view={circuitView} onViewChange={setCircuitView} />

      {circuitView === "body" ? (
        <BodyCircuitDiagram
          measurement={effectiveMeasurement}
          highlightRegion={highlightRegion}
          mode={mode}
          collapseProgress={collapseProgress}
          loading={loading}
          onCollapseRegion={onCollapseRegion}
        />
      ) : (
        <QubitCircuitDiagram
          measurement={effectiveMeasurement}
          highlightRegion={highlightRegion}
          mode={mode}
          collapseProgress={collapseProgress}
          onCollapseRegion={onCollapseRegion}
        />
      )}

      {error ? <div className="quantum-dashboard__error">{error}</div> : null}
      {backend === "ionq_hardware" && health?.ionq_hardware_enabled === false ? <div className="quantum-dashboard__warning">Hardware QPU is disabled (IONQ_ENABLE_HARDWARE is not true); falling back to simulator.</div> : null}
      {backend === "ionq_hardware" && health?.ionq_hardware_enabled !== false ? <div className="quantum-dashboard__warning">Precomputed samples from a real IonQ quantum computer (QPU).</div> : null}
      {effectiveMeasurement?.fallbackReason ? <div className="quantum-dashboard__warning">Fallback: {effectiveMeasurement.fallbackReason}</div> : null}
    </aside>
  );
}

function BackendSelector({ backend, onBackendChange }: { backend: QuantumBackend; onBackendChange: (backend: QuantumBackend) => void }) {
  return (
    <section className="quantum-dashboard__controls" aria-label="Quantum backend selection">
      <label>
        Backend
        <select value={backend} onChange={(event) => onBackendChange(event.target.value as QuantumBackend)}>
          <option value="aer">Aer Local</option>
          <option value="ionq_simulator">IonQ Simulator</option>
          <option value="ionq_hardware">IonQ Hardware QPU</option>
        </select>
      </label>
    </section>
  );
}

function CircuitViewToggle({ view, onViewChange }: { view: CircuitView; onViewChange: (view: CircuitView) => void }) {
  return (
    <div className="quantum-circuit-toggle" role="group" aria-label="Circuit view">
      <button
        type="button"
        className={view === "body" ? "quantum-circuit-toggle__button quantum-circuit-toggle__button--active" : "quantum-circuit-toggle__button"}
        aria-pressed={view === "body"}
        onClick={() => onViewChange("body")}
      >
        Body
      </button>
      <button
        type="button"
        className={view === "circuit" ? "quantum-circuit-toggle__button quantum-circuit-toggle__button--active" : "quantum-circuit-toggle__button"}
        aria-pressed={view === "circuit"}
        onClick={() => onViewChange("circuit")}
      >
        Circuit
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: NodeStatus }) {
  return <span className={`quantum-dashboard__status quantum-dashboard__status--${status}`}>{status}</span>;
}

function normalizeHealth(payload: unknown): QuantumHealth {
  if (!payload || typeof payload !== "object") return {};
  return payload as QuantumHealth;
}
