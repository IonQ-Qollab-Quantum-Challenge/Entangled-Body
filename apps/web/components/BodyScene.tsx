"use client";

import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Vector3Tuple } from "three";

import { emptyRegionStates, type BodyQuantumState, type BodyRegion } from "../lib/bodyRegions";
import { mapQuantumToBody } from "../lib/mapQuantumToBody";
import { getPrecomputed, measure, type QuantumMeasurementPayload } from "../lib/quantumClient";
import { BackgroundMusic } from "./BackgroundMusic";
import { CameraControls } from "./CameraControls";
import { LoadingIntro } from "./LoadingIntro";
import { OriginalGlbModel } from "./OriginalGlbModel";
import { QuantumNodeDashboard } from "./QuantumNodeDashboard";
import { SpaceEnvironment } from "./SpaceEnvironment";

const MODEL_URL = "/models/astronaut_rigged_and_animated.glb";

type AppMode = "inspect" | "measurement";

type InspectedNode = {
  index: number;
  qubitIndex: number;
  region: BodyRegion;
  point: Vector3Tuple;
};

export function BodyScene() {
  const [mode, setMode] = useState<"superposition" | "collapse">("superposition");
  const [appMode, setAppMode] = useState<AppMode>("inspect");
  const [measurementDashboardVisible, setMeasurementDashboardVisible] = useState(false);
  const [collapseProgress, setCollapseProgress] = useState(0);
  const [quantumState, setQuantumState] = useState<BodyQuantumState>({
    regionStates: emptyRegionStates(),
    entanglementLinks: [],
    nodeStates: [],
  });
  const [latestMeasurement, setLatestMeasurement] = useState<QuantumMeasurementPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<BodyRegion | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<Vector3Tuple | null>(null);
  const [modelStable, setModelStable] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [stablePoint, setStablePoint] = useState<Vector3Tuple | null>(null);
  const [stableProgress, setStableProgress] = useState(0);
  const [connectionBreakPoint, setConnectionBreakPoint] = useState<Vector3Tuple | null>(null);
  const [connectionBreakProgress, setConnectionBreakProgress] = useState(0);
  const [inspectedNode, setInspectedNode] = useState<InspectedNode | null>(null);
  const precomputedCache = useRef(new Map<BodyRegion, BodyQuantumState>());
  const lastHoverRegion = useRef<BodyRegion | null>(null);
  const collapseFrame = useRef<number | null>(null);
  const connectionBreakFrame = useRef<number | null>(null);
  const stableReturnFrame = useRef<number | null>(null);
  const stableReturnTimeout = useRef<number | null>(null);
  const collapseLocked = modelStable || collapseFrame.current !== null || stableReturnTimeout.current !== null || stableReturnFrame.current !== null;

  useEffect(() => {
    return () => {
      if (collapseFrame.current !== null) cancelAnimationFrame(collapseFrame.current);
      if (connectionBreakFrame.current !== null) cancelAnimationFrame(connectionBreakFrame.current);
      if (stableReturnFrame.current !== null) cancelAnimationFrame(stableReturnFrame.current);
      if (stableReturnTimeout.current !== null) window.clearTimeout(stableReturnTimeout.current);
    };
  }, []);

  const startConnectionBreakAnimation = useCallback((point?: Vector3Tuple) => {
    if (connectionBreakFrame.current !== null) cancelAnimationFrame(connectionBreakFrame.current);
    setConnectionBreakPoint(point ?? hoveredPoint);
    setConnectionBreakProgress(0);

    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 1300);
      setConnectionBreakProgress(progress);
      if (progress < 1) {
        connectionBreakFrame.current = requestAnimationFrame(tick);
      } else {
        connectionBreakFrame.current = null;
      }
    };

    connectionBreakFrame.current = requestAnimationFrame(tick);
  }, [hoveredPoint]);

  const startCollapseAnimation = useCallback((point?: Vector3Tuple) => {
    if (collapseFrame.current !== null) cancelAnimationFrame(collapseFrame.current);
    if (stableReturnFrame.current !== null) {
      cancelAnimationFrame(stableReturnFrame.current);
      stableReturnFrame.current = null;
    }
    if (stableReturnTimeout.current !== null) {
      window.clearTimeout(stableReturnTimeout.current);
      stableReturnTimeout.current = null;
    }
    setMode("collapse");
    setModelStable(true);
    setStablePoint(point ?? hoveredPoint);
    setStableProgress(0);
    setCollapseProgress(0);

    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 1600);
      setCollapseProgress(progress);
      setStableProgress(progress);
      if (progress < 1) {
        collapseFrame.current = requestAnimationFrame(tick);
      } else {
        collapseFrame.current = null;
        stableReturnTimeout.current = window.setTimeout(() => {
          stableReturnTimeout.current = null;
          const returnStarted = performance.now();
          const returnTick = (returnNow: number) => {
            const returnProgress = Math.min(1, (returnNow - returnStarted) / 2600);
            const reverseProgress = 1 - returnProgress;

            setStableProgress(reverseProgress);
            setCollapseProgress(reverseProgress);
            setConnectionBreakProgress(reverseProgress);

            if (returnProgress < 1) {
              stableReturnFrame.current = requestAnimationFrame(returnTick);
            } else {
              stableReturnFrame.current = null;
              setMode("superposition");
              setCollapseProgress(0);
              setModelStable(false);
              setStablePoint(null);
              setStableProgress(0);
              setConnectionBreakPoint(null);
              setConnectionBreakProgress(0);
            }
          };

          stableReturnFrame.current = requestAnimationFrame(returnTick);
        }, 3400);
      }
    };

    collapseFrame.current = requestAnimationFrame(tick);
  }, [hoveredPoint]);

  const applyWeakMeasurement = useCallback(async (region: BodyRegion | null, point?: Vector3Tuple) => {
    setHoveredRegion(region);
    setHoveredPoint(point ?? null);
    if (modelStable) return;
    if (!region) {
      lastHoverRegion.current = null;
      if (connectionBreakFrame.current === null) {
        setConnectionBreakPoint(null);
        setConnectionBreakProgress(0);
      }
      return;
    }

    if (lastHoverRegion.current === region) return;
    lastHoverRegion.current = region;

    const cached = precomputedCache.current.get(region);
    if (cached) {
      setQuantumState(cached);
      return;
    }

    try {
      setError(null);
      const mapped = mapQuantumToBody(await getPrecomputed(region));
      precomputedCache.current.set(region, mapped);
      setQuantumState(mapped);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Precomputed quantum request failed.");
    }
  }, [modelStable]);

  const inspectQuantumNode = useCallback(async (region: BodyRegion, point?: Vector3Tuple, nodeIndex = 0) => {
    if (loading) return;

    try {
      setLoading(true);
      setError(null);
      setHoveredRegion(region);
      setHoveredPoint(point ?? null);
      setMode("superposition");
      setCollapseProgress(0);
      setModelStable(false);
      setStablePoint(null);
      setStableProgress(0);
      setInspectedNode({
        index: nodeIndex,
        qubitIndex: nodeIndex % 6,
        region,
        point: point ?? hoveredPoint ?? [0, 0, 0],
      });
      const payload = await measure(region, 0.45, 512, { interaction: "hover" });
      const mapped = mapQuantumToBody(payload);
      setLatestMeasurement(payload as QuantumMeasurementPayload);
      setQuantumState(mapped);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Quantum node inspection failed.");
    } finally {
      setLoading(false);
    }
  }, [hoveredPoint, loading]);

  const triggerGlobalCollapse = useCallback(async (region?: BodyRegion, point?: Vector3Tuple) => {
    if (loading || collapseLocked) return;

    try {
      setLoading(true);
      setError(null);
      setInspectedNode(null);
      setHoveredRegion(region ?? hoveredRegion);
      setHoveredPoint(point ?? hoveredPoint);
      startConnectionBreakAnimation(point);
      startCollapseAnimation(point);
      const payload = await measure(region ?? hoveredRegion ?? "torso", 1, 1024, { interaction: "hold" });
      const mapped = mapQuantumToBody(payload);
      setLatestMeasurement(payload as QuantumMeasurementPayload);
      setQuantumState(mapped);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Global collapse failed.");
    } finally {
      setLoading(false);
    }
  }, [collapseLocked, hoveredPoint, hoveredRegion, loading, startCollapseAnimation, startConnectionBreakAnimation]);

  const applyStrongMeasurement = useCallback((region: BodyRegion, point?: Vector3Tuple, nodeIndex?: number) => {
    if (appMode === "inspect") {
      void inspectQuantumNode(region, point, nodeIndex);
      return;
    }

    void triggerGlobalCollapse(region, point);
  }, [appMode, inspectQuantumNode, triggerGlobalCollapse]);

  const handleGlobalCollapse = useCallback(() => {
    if (appMode !== "measurement") return;
    void triggerGlobalCollapse();
  }, [appMode, triggerGlobalCollapse]);

  const handleModelReady = useCallback(() => {
    setModelReady(true);
  }, []);

  const handleIntroComplete = useCallback(() => {
    setIntroComplete(true);
  }, []);

  const handleIntroExitStart = useCallback(() => {
    setMusicPlaying(true);
  }, []);

  const toggleMusicMuted = useCallback(() => {
    setMusicMuted((muted) => !muted);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "m" || event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      toggleMusicMuted();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleMusicMuted]);

  const switchAppMode = useCallback((nextMode: AppMode) => {
    if (nextMode === "measurement") {
      if (appMode === "measurement") {
        setMeasurementDashboardVisible((visible) => !visible);
        return;
      }

      setMeasurementDashboardVisible(true);
    }

    setAppMode(nextMode);
    setError(null);
    setInspectedNode(null);
    if (nextMode === "inspect") {
      if (connectionBreakFrame.current !== null) {
        cancelAnimationFrame(connectionBreakFrame.current);
        connectionBreakFrame.current = null;
      }
      setMode("superposition");
      setCollapseProgress(0);
      setModelStable(false);
      setStablePoint(null);
      setStableProgress(0);
      setConnectionBreakPoint(null);
      setConnectionBreakProgress(0);
    }
  }, [appMode]);

  return (
    <main style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <Canvas camera={{ position: [0, 0.2, 5.35], fov: 36 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={["#07090d"]} />
        <ambientLight intensity={0.78} />
        <directionalLight position={[2.6, 4.2, 3.4]} intensity={1.85} />
        <directionalLight position={[-2.2, 1.4, 2.4]} intensity={0.72} color="#bfe8ff" />
        <pointLight position={[-2.4, 1.2, 2.2]} intensity={0.72} color="#85d8ff" />
        <SpaceEnvironment sunOcclusion={modelStable ? stableProgress : 0} />
        <group rotation={[0, -0.08, 0]}>
          <OriginalGlbModel
            modelUrl={MODEL_URL}
            hoveredRegion={hoveredRegion}
            hoveredPoint={hoveredPoint}
            onHoverRegion={applyWeakMeasurement}
            onMeasureRegion={applyStrongMeasurement}
            onGlobalCollapse={handleGlobalCollapse}
            onReady={handleModelReady}
            stable={modelStable}
            stablePoint={stablePoint}
            stableProgress={stableProgress}
            connectionBreakPoint={connectionBreakPoint}
            connectionBreakProgress={connectionBreakProgress}
            opacity={0.22}
            waveStrength={0}
          />
        </group>
        <CameraControls />
      </Canvas>
      <div className="scene-mode-switch" aria-label="Interaction mode">
        <button type="button" className={appMode === "inspect" ? "scene-mode-switch__button scene-mode-switch__button--active" : "scene-mode-switch__button"} onClick={() => switchAppMode("inspect")}>
          Inspect
        </button>
        <button type="button" className={appMode === "measurement" ? "scene-mode-switch__button scene-mode-switch__button--active" : "scene-mode-switch__button"} onClick={() => switchAppMode("measurement")}>
          Measurement
        </button>
      </div>
      <button
        type="button"
        className={!musicMuted ? "music-toggle music-toggle--playing" : "music-toggle"}
        onClick={toggleMusicMuted}
        aria-label={musicMuted ? "Unmute background music" : "Mute background music"}
        aria-pressed={musicMuted}
        title={musicMuted ? "Unmute background music (M)" : "Mute background music (M)"}
      >
        <span className="music-toggle__icon" aria-hidden="true" />
      </button>
      <LoadingIntro modelReady={modelReady} onComplete={handleIntroComplete} onExitStart={handleIntroExitStart} visible={!introComplete} />
      <BackgroundMusic playing={musicPlaying} muted={musicMuted} onPlayingChange={setMusicPlaying} />
      {error ? <div className="scene-status" role="status" aria-live="polite">{error}</div> : null}
      <QuantumNodeDashboard
        latestMeasurement={latestMeasurement}
        appMode={appMode}
        visible={appMode !== "measurement" || measurementDashboardVisible}
        mode={mode}
        collapseProgress={collapseProgress}
        stableProgress={stableProgress}
        modelStable={modelStable}
        loading={loading}
        inspectedNode={inspectedNode}
      />
    </main>
  );
}
