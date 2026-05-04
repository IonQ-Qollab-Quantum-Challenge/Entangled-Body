"use client";

import { Canvas } from "@react-three/fiber";
import { useCallback, useRef, useState } from "react";
import type { Vector3Tuple } from "three";

import { emptyRegionStates, type BodyQuantumState, type BodyRegion } from "../lib/bodyRegions";
import { mapQuantumToBody } from "../lib/mapQuantumToBody";
import { getPrecomputed } from "../lib/quantumClient";
import { CollapseController } from "./CollapseController";
import { CameraControls } from "./CameraControls";
import { InteractionLayer } from "./InteractionLayer";
import { SpaceEnvironment } from "./SpaceEnvironment";
import { TileCloudBody } from "./TileCloudBody";

export function BodyScene() {
  const [mode, setMode] = useState<"superposition" | "collapse">("superposition");
  const [collapseProgress, setCollapseProgress] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [quantumState, setQuantumState] = useState<BodyQuantumState>({
    regionStates: emptyRegionStates(),
    entanglementLinks: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<BodyRegion | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<Vector3Tuple | null>(null);
  const [stableProgress, setStableProgress] = useState(0);
  const precomputedCache = useRef(new Map<BodyRegion, BodyQuantumState>());
  const lastHoverRegion = useRef<BodyRegion | null>(null);

  const applyWeakMeasurement = useCallback(async (region: BodyRegion | null, point?: Vector3Tuple) => {
    if (collapsed) {
      setHoveredRegion(null);
      setHoveredPoint(null);
      return;
    }

    setHoveredRegion(region);
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
  }, [collapsed]);

  const toggleBodyRepresentation = useCallback(() => {
    setError(null);
    setCollapsed((currentCollapsed) => {
      const nextCollapsed = !currentCollapsed;
      const nextProgress = nextCollapsed ? 1 : 0;
      setHoveredRegion(null);
      setHoveredPoint(null);
      setCollapseProgress(nextProgress);
      setStableProgress(nextProgress);
      setMode(nextCollapsed ? "collapse" : "superposition");
      return nextCollapsed;
    });
  }, []);

  const applyStrongMeasurement = useCallback((region: BodyRegion, point?: Vector3Tuple) => {
    void region;
    setHoveredPoint(point ?? hoveredPoint);
    toggleBodyRepresentation();
  }, [hoveredPoint, toggleBodyRepresentation]);

  const triggerGlobalCollapse = useCallback(() => {
    toggleBodyRepresentation();
  }, [toggleBodyRepresentation]);

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
          <TileCloudBody quantumState={quantumState} mode={mode} collapsed={collapsed} collapseProgress={collapseProgress} hoveredRegion={hoveredRegion} tileCount={18000} />
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
