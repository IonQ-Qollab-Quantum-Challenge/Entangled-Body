"use client";

import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Vector3Tuple } from "three";

import { emptyRegionStates, type BodyQuantumState, type BodyRegion } from "../lib/bodyRegions";
import { mapQuantumToBody } from "../lib/mapQuantumToBody";
import { getPrecomputed, measure } from "../lib/quantumClient";
import { CollapseController } from "./CollapseController";
import { CameraControls } from "./CameraControls";
import { InteractionLayer } from "./InteractionLayer";
import { SpaceEnvironment } from "./SpaceEnvironment";
import { TileCloudBody } from "./TileCloudBody";

export function BodyScene() {
  const [mode, setMode] = useState<"superposition" | "collapse">("superposition");
  const [collapseProgress, setCollapseProgress] = useState(0);
  const [quantumState, setQuantumState] = useState<BodyQuantumState>({
    regionStates: emptyRegionStates(),
    entanglementLinks: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<Vector3Tuple | null>(null);
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

  const startMeasurementPulse = useCallback(() => {
    if (collapseFrame.current !== null) cancelAnimationFrame(collapseFrame.current);
    if (stableReturnTimeout.current !== null) {
      window.clearTimeout(stableReturnTimeout.current);
      stableReturnTimeout.current = null;
    }
    setMode("collapse");
    setCollapseProgress(0);
    setStableProgress(0);

    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 1200);
      setCollapseProgress(progress);
      setStableProgress(progress);
      if (progress < 1) {
        collapseFrame.current = requestAnimationFrame(tick);
      } else {
        collapseFrame.current = null;
        stableReturnTimeout.current = window.setTimeout(() => {
          const returnStarted = performance.now();
          const returnTick = (returnNow: number) => {
            const returnProgress = Math.max(0, 1 - (returnNow - returnStarted) / 1800);
            setCollapseProgress(returnProgress);
            setStableProgress(returnProgress);
            if (returnProgress > 0) {
              collapseFrame.current = requestAnimationFrame(returnTick);
            } else {
              collapseFrame.current = null;
              stableReturnTimeout.current = null;
              setMode("superposition");
            }
          };

          collapseFrame.current = requestAnimationFrame(returnTick);
        }, 900);
      }
    };

    collapseFrame.current = requestAnimationFrame(tick);
  }, []);

  const applyWeakMeasurement = useCallback(async (region: BodyRegion | null, point?: Vector3Tuple) => {
    setHoveredPoint(point ?? null);
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
  }, []);

  const applyStrongMeasurement = useCallback(async (region: BodyRegion, point?: Vector3Tuple) => {
    setHoveredPoint(point ?? hoveredPoint);
    if (loading) return;

    try {
      setLoading(true);
      setError(null);
      startMeasurementPulse();
      const mapped = mapQuantumToBody(await measure(region, 1, 1024));
      setQuantumState(mapped);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Simulator measurement failed.");
    } finally {
      setLoading(false);
    }
  }, [hoveredPoint, loading, startMeasurementPulse]);

  const triggerGlobalCollapse = useCallback(() => {
    if (collapseFrame.current !== null) cancelAnimationFrame(collapseFrame.current);
    if (stableReturnTimeout.current !== null) {
      window.clearTimeout(stableReturnTimeout.current);
      stableReturnTimeout.current = null;
    }
    setMode("collapse");
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

  return (
    <main style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <Canvas camera={{ position: [0, 0.2, 5.35], fov: 36 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
        <color attach="background" args={["#07090d"]} />
        <ambientLight intensity={0.78} />
        <directionalLight position={[2.6, 4.2, 3.4]} intensity={1.85} />
        <directionalLight position={[-2.2, 1.4, 2.4]} intensity={0.72} color="#bfe8ff" />
        <pointLight position={[-2.4, 1.2, 2.2]} intensity={0.72} color="#85d8ff" />
        <SpaceEnvironment />
        <group rotation={[0, -0.08, 0]}>
          <TileCloudBody quantumState={quantumState} mode={mode} collapseProgress={collapseProgress} tileCount={18000} />
          <InteractionLayer onHoverRegion={applyWeakMeasurement} onMeasureRegion={applyStrongMeasurement} onGlobalCollapse={triggerGlobalCollapse} />
        </group>
        <CameraControls />
      </Canvas>
      {/*
      <div style={{ position: "fixed", left: "50%", top: 30, transform: "translateX(-50%)", display: "grid", gap: 16, textAlign: "center" }}>
        <div style={{ fontSize: 84, fontWeight: 900, letterSpacing: 0 }}>Entangled Body</div>
        <div style={{ fontSize: 36, color: "rgba(245,247,251,0.68)" }}>quantum slice cloud | baked astronaut surface</div>
      </div>
      <CollapseController
        mode={mode}
        collapseProgress={collapseProgress}
        stableProgress={stableProgress}
        modelStable={mode === "collapse"}
        loading={loading}
        error={error}
      />
      */}
    </main>
  );
}
