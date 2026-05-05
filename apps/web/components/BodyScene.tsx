"use client";

import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Vector3Tuple } from "three";

import { emptyRegionStates, type BodyQuantumState, type BodyRegion } from "../lib/bodyRegions";
import { mapQuantumToBody } from "../lib/mapQuantumToBody";
import { getPrecomputed, measure, type QuantumMeasurementPayload } from "../lib/quantumClient";
import { CameraControls } from "./CameraControls";
import { InteractionLayer } from "./InteractionLayer";
import { OriginalGlbModel } from "./OriginalGlbModel";
import { QuantumNodeDashboard } from "./QuantumNodeDashboard";
import { SpaceEnvironment } from "./SpaceEnvironment";
import { TileCloudBody } from "./TileCloudBody";

const MODEL_URL = "/models/astronaut_rigged_and_animated.glb";

export function BodyScene() {
  const [mode, setMode] = useState<"superposition" | "collapse">("superposition");
  const [collapseProgress, setCollapseProgress] = useState(0);
  const [quantumState, setQuantumState] = useState<BodyQuantumState>({
    regionStates: emptyRegionStates(),
    entanglementLinks: [],
    nodeStates: [],
  });
  const [latestMeasurement, setLatestMeasurement] = useState<QuantumMeasurementPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<"tileCloud" | "originalModel">("originalModel");
  const [hoveredRegion, setHoveredRegion] = useState<BodyRegion | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<Vector3Tuple | null>(null);
  const [modelStable, setModelStable] = useState(false);
  const [stablePoint, setStablePoint] = useState<Vector3Tuple | null>(null);
  const [stableProgress, setStableProgress] = useState(0);
  const precomputedCache = useRef(new Map<BodyRegion, BodyQuantumState>());
  const lastHoverRegion = useRef<BodyRegion | null>(null);
  const collapseFrame = useRef<number | null>(null);
  const stableReturnTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (collapseFrame.current !== null) cancelAnimationFrame(collapseFrame.current);
      if (stableReturnTimeout.current !== null) window.clearTimeout(stableReturnTimeout.current);
    };
  }, []);

  const startStableReveal = useCallback((point?: Vector3Tuple) => {
    if (collapseFrame.current !== null) cancelAnimationFrame(collapseFrame.current);
    if (stableReturnTimeout.current !== null) {
      window.clearTimeout(stableReturnTimeout.current);
      stableReturnTimeout.current = null;
    }
    setModelStable(true);
    setStablePoint(point ?? hoveredPoint);
    setStableProgress(0);

    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 3000);
      setStableProgress(progress);
      if (progress < 1) {
        collapseFrame.current = requestAnimationFrame(tick);
      } else {
        collapseFrame.current = null;
        stableReturnTimeout.current = window.setTimeout(() => {
          const returnStarted = performance.now();
          const returnTick = (returnNow: number) => {
            const returnProgress = Math.max(0, 1 - (returnNow - returnStarted) / 3000);
            setStableProgress(returnProgress);
            if (returnProgress > 0) {
              collapseFrame.current = requestAnimationFrame(returnTick);
            } else {
              collapseFrame.current = null;
              stableReturnTimeout.current = null;
              setModelStable(false);
              setStablePoint(null);
            }
          };

          collapseFrame.current = requestAnimationFrame(returnTick);
        }, 5000);
      }
    };

    collapseFrame.current = requestAnimationFrame(tick);
  }, [hoveredPoint]);

  const startCollapseAnimation = useCallback(() => {
    if (collapseFrame.current !== null) cancelAnimationFrame(collapseFrame.current);
    if (stableReturnTimeout.current !== null) {
      window.clearTimeout(stableReturnTimeout.current);
      stableReturnTimeout.current = null;
    }
    setMode("collapse");
    setRenderMode("tileCloud");
    setModelStable(false);
    setStablePoint(null);
    setStableProgress(0);
    setCollapseProgress(0);

    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 1600);
      setCollapseProgress(progress);
      if (progress < 1) {
        collapseFrame.current = requestAnimationFrame(tick);
      } else {
        collapseFrame.current = null;
      }
    };

    collapseFrame.current = requestAnimationFrame(tick);
  }, []);

  const applyWeakMeasurement = useCallback(async (region: BodyRegion | null, point?: Vector3Tuple) => {
    setHoveredRegion(region);
    setHoveredPoint(point ?? null);
    if (modelStable) return;
    if (!region) {
      lastHoverRegion.current = null;
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

  const applyStrongMeasurement = useCallback(async (region: BodyRegion, point?: Vector3Tuple) => {
    if (modelStable || loading) return;

    try {
      setLoading(true);
      setError(null);
      setHoveredRegion(region);
      setHoveredPoint(point ?? null);
      setMode("superposition");
      setCollapseProgress(0);
      setRenderMode("originalModel");
      startStableReveal(point);
      const payload = await measure(region, 1, 1024, { interaction: "click" });
      const mapped = mapQuantumToBody(payload);
      setLatestMeasurement(payload as QuantumMeasurementPayload);
      setQuantumState(mapped);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Simulator measurement failed.");
    } finally {
      setLoading(false);
    }
  }, [loading, modelStable, startStableReveal]);

  const triggerGlobalCollapse = useCallback(async () => {
    if (loading) return;

    try {
      setLoading(true);
      setError(null);
      startCollapseAnimation();
      const payload = await measure(hoveredRegion ?? "torso", 1, 1024, { interaction: "hold" });
      const mapped = mapQuantumToBody(payload);
      setLatestMeasurement(payload as QuantumMeasurementPayload);
      setQuantumState(mapped);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Global collapse failed.");
    } finally {
      setLoading(false);
    }
  }, [hoveredRegion, loading, startCollapseAnimation]);

  return (
    <main style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <Canvas camera={{ position: [0, 0.2, 5.35], fov: 36 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={["#07090d"]} />
        <ambientLight intensity={0.78} />
        <directionalLight position={[2.6, 4.2, 3.4]} intensity={1.85} />
        <directionalLight position={[-2.2, 1.4, 2.4]} intensity={0.72} color="#bfe8ff" />
        <pointLight position={[-2.4, 1.2, 2.2]} intensity={0.72} color="#85d8ff" />
        <SpaceEnvironment />
        <group rotation={[0, -0.08, 0]}>
          {renderMode === "tileCloud" ? (
            <>
              <TileCloudBody modelUrl={MODEL_URL} quantumState={quantumState} mode={mode} collapseProgress={collapseProgress} tileCount={18000} />
              <InteractionLayer onHoverRegion={applyWeakMeasurement} onMeasureRegion={applyStrongMeasurement} onGlobalCollapse={triggerGlobalCollapse} />
            </>
          ) : (
            <OriginalGlbModel
              modelUrl={MODEL_URL}
              hoveredRegion={hoveredRegion}
              hoveredPoint={hoveredPoint}
              onHoverRegion={applyWeakMeasurement}
              onMeasureRegion={applyStrongMeasurement}
              onGlobalCollapse={triggerGlobalCollapse}
              stable={modelStable}
              stablePoint={stablePoint}
              stableProgress={stableProgress}
              opacity={0.22}
              waveStrength={0}
            />
          )}
        </group>
        <CameraControls />
      </Canvas>
      <div style={{ position: "fixed", left: "50%", top: 30, transform: "translateX(-50%)", display: "grid", gap: 16, textAlign: "center" }}>
        <div style={{ fontSize: 84, fontWeight: 900, letterSpacing: 0 }}>Entangled Body</div>
        <div style={{ fontSize: 36, color: "rgba(245,247,251,0.68)" }}>original GLB | transparent wave | hold collapse</div>
      </div>
      <QuantumNodeDashboard
        latestMeasurement={latestMeasurement}
        mode={mode}
        collapseProgress={collapseProgress}
        stableProgress={stableProgress}
        modelStable={modelStable}
        loading={loading}
      />
    </main>
  );
}
