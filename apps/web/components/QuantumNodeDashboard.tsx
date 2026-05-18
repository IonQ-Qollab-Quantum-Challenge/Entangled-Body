"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { BODY_REGIONS, type BodyRegion, type QuantumNodeState } from "../lib/bodyRegions";
import { getQuantumHealth, measure, type QuantumBackend, type QuantumInteraction, type QuantumMeasurementPayload } from "../lib/quantumClient";

type NodeStatus = "checking" | "online" | "degraded" | "offline";

type QuantumHealth = {
  ok?: boolean;
  mode?: string;
  ionq_configured?: boolean;
  ionq_hardware_enabled?: boolean;
  default_backend?: string;
  available_backends?: QuantumBackend[];
};

const REGION_LABELS: Record<BodyRegion, string> = {
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

const QUANTUM_NODE_LABELS = [
  "Head",
  "Chest",
  "Torso",
  "Oxygen Tank",
  "Right Shoulder",
  "Left Shoulder",
  "Right Arm",
  "Left Arm",
  "Right Hand",
  "Left Hand",
  "Right Leg",
  "Left Leg",
  "Right Foot",
  "Left Foot",
];

type ModeCopy = {
  eyebrow: string;
  title: string;
  metaphor: string;
  science: string;
};

const MODE_COPY: { measurement: ModeCopy } = {
  measurement: {
    eyebrow: "Global Collapse",
    title: "When the Field Chooses a Shape",
    metaphor:
      "The body is held between many possible arrangements until measurement turns uncertainty into one visible state. Lines, bits, and motion become a record of that decision.",
    science:
      "Measurement mode sends a stronger interaction to the quantum simulator. Multiple shots sample a 14-qubit circuit, producing count distributions and a dominant bitstring that are mapped back into activation, coherence, displacement, and entanglement links across the body.",
  },
};

const INSPECT_REGION_COPY: Partial<Record<BodyRegion, ModeCopy>> = {
  head: {
    eyebrow: "Local Observation",
    title: "The Signal of Thought",
    metaphor:
      "The head behaves like a small observatory. A touch here feels like asking the body where attention begins before it becomes a visible decision.",
    science:
      "This region maps the selected head node to a qubit sample. The returned bit, probability, and coherence values describe the local simulated state without triggering a full-body collapse. It shows strong entanglement with adjacent regions such as the torso, where local observation can influence nearby body states.",
  },
  torso: {
    eyebrow: "Local Observation",
    title: "The Chamber of Resonance",
    metaphor:
      "The torso holds the body like a resonant chamber. When it is inspected, the field answers from the center, where separate signals begin to feel connected.",
    science:
      "Torso inspection samples the qubit associated with the body's central region. Its probability and coherence are used to visualize how stable the local state remains under observation. It shows strong entanglement with adjacent regions including the head, arms, and legs, acting as the main bridge between local states.",
  },
  leftArm: {
    eyebrow: "Local Observation",
    title: "The Left Arc of Contact",
    metaphor:
      "The left arm is a line reaching outward. Inspecting it turns gesture into evidence, as if touch could leave a measurable trace in the field.",
    science:
      "Left arm inspection maps the selected arm node to a qubit index and reads a localized measurement result. The UI shows whether the node remains superposed or has collapsed in the sampled state. It shows strong entanglement with adjacent regions such as the torso and shoulder-side nodes.",
  },
  rightArm: {
    eyebrow: "Local Observation",
    title: "The Right Arc of Action",
    metaphor:
      "The right arm carries intention into space. A measurement here feels like watching possibility become an action before the whole body follows.",
    science:
      "Right arm inspection performs the same localized node measurement for the right-side region. The sampled bit and coherence value are used to represent local quantum response. It shows strong entanglement with adjacent regions such as the torso and shoulder-side nodes.",
  },
  leftLeg: {
    eyebrow: "Local Observation",
    title: "The Left Anchor of Balance",
    metaphor:
      "The left leg is an anchor beneath uncertainty. Inspecting it asks how a body keeps balance while its state is still unfinished.",
    science:
      "Left leg inspection samples the mapped lower-body qubit. The resulting probability and coherence values indicate how the local simulated state contributes to body stability. It shows strong entanglement with adjacent regions such as the torso and neighboring lower-body nodes.",
  },
  rightLeg: {
    eyebrow: "Local Observation",
    title: "The Right Anchor of Motion",
    metaphor:
      "The right leg suggests the beginning of movement. A touch here reads the body at the edge between stillness and departure.",
    science:
      "Right leg inspection reads the corresponding lower-body qubit sample. Its measured bit, probability, and coherence are displayed as the local state of that region. It shows strong entanglement with adjacent regions such as the torso and neighboring lower-body nodes.",
  },
};

const DEFAULT_INSPECT_COPY: ModeCopy = {
  eyebrow: "Local Observation",
  title: "The Local Quantum Node",
  metaphor: "A selected point becomes the place where the body answers with one sampled state.",
  science:
    "This node is backed by its own qubit in the simulator. The returned bit, probability, and coherence values are mapped into the connected body network and displayed as the local measurement response.",
};

const INSPECT_NODE_COPY: Record<number, ModeCopy> = {
  0: {
    eyebrow: "Local Observation",
    title: "Head: The Observing Field",
    metaphor: "The helmet becomes a quiet observatory, where attention gathers before the body chooses how to answer.",
    science:
      "The head node is mapped to the upper-body qubit sample. It is strongly entangled with adjacent nodes such as Chest and Oxygen Tank, so a local observation here can shift the nearby central network.",
  },
  1: {
    eyebrow: "Local Observation",
    title: "Chest: The Resonant Core",
    metaphor: "The chest receives signals like breath inside a chamber, turning separate points into one shared pulse.",
    science:
      "The chest node sits at the central bridge of the network. It shows strong entanglement with Head, Torso, Oxygen Tank, and both shoulder nodes, making it one of the most connected local states.",
  },
  2: {
    eyebrow: "Local Observation",
    title: "Torso: The Body's Axis",
    metaphor: "The torso holds the body's vertical axis, where upper motion and lower balance meet inside one field.",
    science:
      "The torso node connects the upper body to both legs. It is strongly entangled with Chest, Oxygen Tank, Right Leg, and Left Leg, so its measurement describes how the body transfers state between regions.",
  },
  3: {
    eyebrow: "Local Observation",
    title: "Oxygen Tank: The Hidden Reservoir",
    metaphor: "The oxygen tank is the unseen reserve behind the body, a quiet source that keeps the field alive.",
    science:
      "The oxygen tank node is treated as a back-side support state. It is strongly entangled with Head, Chest, Torso, and both shoulder nodes, linking visible posture to hidden structural context.",
  },
  4: {
    eyebrow: "Local Observation",
    title: "Right Shoulder: The Joint of Intention",
    metaphor: "The right shoulder is a hinge between center and reach, where intention prepares to leave the torso.",
    science:
      "The right shoulder node is strongly entangled with Chest, Oxygen Tank, and Right Arm. Its local measurement helps explain how the central state propagates into the right-side limb.",
  },
  5: {
    eyebrow: "Local Observation",
    title: "Left Shoulder: The Joint of Contact",
    metaphor: "The left shoulder opens a path from the body's center toward contact with the surrounding field.",
    science:
      "The left shoulder node is strongly entangled with Chest, Oxygen Tank, and Left Arm. Its sampled state represents the transfer between the torso network and the left-side limb.",
  },
  6: {
    eyebrow: "Local Observation",
    title: "Right Arm: The Arc of Action",
    metaphor: "The right arm extends possibility outward, turning the body's inner signal into visible action.",
    science:
      "The right arm node is strongly entangled with Right Shoulder and Right Hand. Measurement here reads a mid-limb state between central intention and endpoint response.",
  },
  7: {
    eyebrow: "Local Observation",
    title: "Left Arm: The Arc of Contact",
    metaphor: "The left arm reaches like a drawn line, carrying the body's relation into space.",
    science:
      "The left arm node is strongly entangled with Left Shoulder and Left Hand. Its local sample shows how a nearby shoulder state continues toward the hand.",
  },
  8: {
    eyebrow: "Local Observation",
    title: "Right Hand: The Point of Touch",
    metaphor: "The right hand is where the body becomes an instrument, leaving a precise trace in the field.",
    science:
      "The right hand node is strongly entangled with Right Arm. As an endpoint node, its measurement emphasizes how a local touch reflects the state carried through the adjacent limb.",
  },
  9: {
    eyebrow: "Local Observation",
    title: "Left Hand: The Point of Response",
    metaphor: "The left hand catches the field at its edge, where relation becomes a visible response.",
    science:
      "The left hand node is strongly entangled with Left Arm. Its sampled bit and coherence describe the endpoint response of the left-side connection chain.",
  },
  10: {
    eyebrow: "Local Observation",
    title: "Right Leg: The Descent of Motion",
    metaphor: "The right leg carries the body's uncertainty downward, preparing stillness to become movement.",
    science:
      "The right leg node is strongly entangled with Torso and Right Foot. It represents how the central body state is transferred into lower-body motion and support.",
  },
  11: {
    eyebrow: "Local Observation",
    title: "Left Leg: The Descent of Balance",
    metaphor: "The left leg steadies the field, giving the body's possible states a place to stand.",
    science:
      "The left leg node is strongly entangled with Torso and Left Foot. Its measurement explains how lower-body balance remains coupled to the central torso state.",
  },
  12: {
    eyebrow: "Local Observation",
    title: "Right Foot: The Grounded Trace",
    metaphor: "The right foot marks the boundary between body and ground, where motion leaves its final trace.",
    science:
      "The right foot node is strongly entangled with Right Leg. As a lower endpoint, it shows how the adjacent leg state resolves into support and contact.",
  },
  13: {
    eyebrow: "Local Observation",
    title: "Left Foot: The Grounded Echo",
    metaphor: "The left foot answers the body from below, turning balance into a quiet echo of the whole network.",
    science:
      "The left foot node is strongly entangled with Left Leg. Its local measurement reflects the endpoint of the left lower-body entanglement chain.",
  },
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
}: QuantumNodeDashboardProps) {
  const [status, setStatus] = useState<NodeStatus>("checking");
  const [health, setHealth] = useState<QuantumHealth | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<BodyRegion>("torso");
  const [interaction, setInteraction] = useState<QuantumInteraction>("click");
  const [shots] = useState(1);
  const [seed, setSeed] = useState(42);
  const [measurement, setMeasurement] = useState<QuantumMeasurementPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string>("--");
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
          backend,
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
  }, [backend, interaction, seed, selectedRegion, shots]);

  const effectiveMeasurement = measurement ?? latestMeasurement;
  const topCounts = useMemo(() => {
    if (!effectiveMeasurement?.counts) return [];
    return Object.entries(effectiveMeasurement.counts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4);
  }, [effectiveMeasurement]);

  const selectedState = effectiveMeasurement?.regionStates?.[selectedRegion];
  const nodeStates = effectiveMeasurement?.nodeStates ?? [];
  const inspectedNodeState = getInspectedNodeState(nodeStates, inspectedNode);
  const executionMode = formatExecutionMode(effectiveMeasurement, health, backend);
  const sceneProgress = mode === "collapse" ? collapseProgress : stableProgress;
  const sceneStatus = loading ? "measuring" : modelStable ? "stabilizing" : "ready";
  const copy =
    appMode === "inspect"
      ? INSPECT_NODE_COPY[inspectedNode?.index ?? -1] ?? INSPECT_REGION_COPY[inspectedNode?.region ?? "torso"] ?? DEFAULT_INSPECT_COPY
      : MODE_COPY.measurement;

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
          <div className="quantum-dashboard__eyebrow">{copy.eyebrow}</div>
          <h2>{copy.title}</h2>
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

      <ModeStory copy={copy} />
      <BackendSelector backend={backend} onBackendChange={onBackendChange} />

      {appMode === "measurement" ? (
        <>
          <MeasurementState measurement={effectiveMeasurement} executionMode={executionMode} />
          <NodeStateList nodeStates={nodeStates} showState />
        </>
      ) : (
        <section className="quantum-dashboard__inspect-node" aria-label="Selected quantum node">
          <div className="quantum-dashboard__section-title">Selected Node</div>
          <div className="quantum-dashboard__inspect-grid">
            <Metric label="Node" value={formatNodeLabel(inspectedNode?.index)} />
            <Metric label="Qubit" value={String(inspectedNode?.qubitIndex ?? "--")} />
            <Metric label="Bit" value={inspectedNodeState?.measuredBit ?? "-"} />
            <Metric label="Probability" value={formatStateValue(inspectedNodeState?.probability)} />
            <Metric label="Activation" value={formatStateValue(inspectedNodeState?.activation)} />
            <Metric label="Coherence" value={formatStateValue(inspectedNodeState?.coherence)} />
          </div>
        </section>
      )}

      {error ? <div className="quantum-dashboard__error">{error}</div> : null}
      {backend === "ionq_hardware" ? <div className="quantum-dashboard__warning">Hardware QPU only runs when IONQ_ENABLE_HARDWARE=true.</div> : null}
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

function ModeStory({ copy }: { copy: ModeCopy }) {
  return (
    <section className="quantum-dashboard__story" aria-label="Mode story and scientific information">
      <p>{copy.metaphor}</p>
      <div className="quantum-dashboard__science">
        <div className="quantum-dashboard__section-title">Scientific Information</div>
        <p>{copy.science}</p>
      </div>
    </section>
  );
}

function MeasurementState({ measurement, executionMode }: { measurement?: QuantumMeasurementPayload | null; executionMode: string }) {
  return (
    <section className="quantum-dashboard__state">
      <Metric label="Entangled Links" value={String(measurement?.entanglementLinks?.length ?? 0)} />
      <Metric label="Dominant State" value={measurement?.dominantBitstring ?? "------"} />
      <Metric label="Mode" value={executionMode} />
      <Metric label="Circuit" value={formatCircuitType(measurement?.circuitType)} />
    </section>
  );
}

function ProbeResult({ measurement, topCounts }: { measurement?: QuantumMeasurementPayload | null; topCounts: Array<[string, number]> }) {
  return (
    <section className="quantum-dashboard__result">
      <div className="quantum-dashboard__result-header">
        <span>{measurement?.requestedBackend ?? measurement?.backend ?? "Dominant"}</span>
        <strong>{measurement?.dominantBitstring ?? "------"}</strong>
      </div>
      <div className="quantum-dashboard__bars">
        {topCounts.length > 0 ? (
          topCounts.map(([bitstring, count]) => (
            <div key={bitstring} className="quantum-dashboard__bar-row">
              <span>{bitstring}</span>
              <div>
                <i style={{ width: `${Math.max(4, (count / Math.max(1, measurement?.shots ?? count)) * 100)}%` }} />
              </div>
              <b>{count}</b>
            </div>
          ))
        ) : (
          <div className="quantum-dashboard__empty">No probe data</div>
        )}
      </div>
    </section>
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

function getInspectedNodeState(nodeStates: QuantumNodeState[], inspectedNode: InspectedNode | null): QuantumNodeState | null {
  if (!inspectedNode || nodeStates.length === 0) return null;
  return nodeStates.find((node) => node.qubitIndex === inspectedNode.qubitIndex) ?? nodeStates[inspectedNode.index % nodeStates.length];
}

function formatNodeLabel(index: number | undefined): string {
  if (typeof index !== "number") return "--";
  return QUANTUM_NODE_LABELS[index] ?? `Node ${index}`;
}

function formatStateValue(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "--";
}

function formatCircuitType(circuitType: string | undefined): string {
  if (!circuitType) return "--";
  return circuitType.replaceAll("_", " ");
}

function formatExecutionMode(measurement: QuantumMeasurementPayload | null | undefined, health: QuantumHealth | null, selectedBackend: QuantumBackend): string {
  if (measurement) {
    const source = measurement.source;
    const provider = measurement.provider;
    const backend = measurement.backend;
    const requestedBackend = measurement.requestedBackend;

    if (source === "precomputed" || provider === "precomputed") return "Precomputed";
    if (source === "local-fallback") return "Local fallback";
    if (provider === "ionq" && measurement.hardware) return "Live QPU";
    if (provider === "ionq" || requestedBackend === "ionq_simulator" || backend === "ionq_simulator") return "IonQ simulator";
    if (provider === "aer" || requestedBackend === "aer" || backend === "aer") {
      return source === "fallback" ? "Aer fallback" : "Aer simulator";
    }
    if (source === "fallback") return "Fallback";
  }

  if (selectedBackend === "aer") return "Aer simulator";
  if (selectedBackend === "ionq_simulator") return "IonQ simulator";
  if (selectedBackend === "ionq_hardware") return "Live QPU";
  if (health?.default_backend === "ionq_hardware") return "Live QPU";
  if (health?.default_backend === "ionq_simulator" || health?.mode === "ionq_simulator") return "IonQ simulator";
  if (health?.mode === "live") return "Live QPU";
  if (health?.mode === "simulator") return "Simulator";
  return "--";
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function NodeStateList({ nodeStates, showState = true }: { nodeStates: QuantumNodeState[]; showState?: boolean }) {
  return (
    <section className="quantum-dashboard__nodes">
      <div className="quantum-dashboard__section-title">Node States</div>
      {nodeStates.length > 0 ? (
        nodeStates.map((node) => (
          <div key={`${node.region}-${node.qubitIndex}`} className={showState ? "quantum-dashboard__node-row" : "quantum-dashboard__node-row quantum-dashboard__node-row--compact"}>
            <span>{REGION_LABELS[node.region]}</span>
            <b>{node.measuredBit}</b>
            {showState ? <i>{node.collapsed ? "collapsed" : "measured"}</i> : null}
          </div>
        ))
      ) : (
        <div className="quantum-dashboard__empty">No node states</div>
      )}
    </section>
  );
}
