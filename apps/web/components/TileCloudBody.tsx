"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from "three";

import { type BodyQuantumState, type TileState } from "../lib/bodyRegions";
import { sampleGlbToTiles } from "../lib/sampleGlbToTiles";

type TileCloudBodyProps = {
  modelUrl: string;
  quantumState: BodyQuantumState;
  mode: "superposition" | "collapse";
  collapseProgress: number;
  tileCount?: number;
};

const TILE_SIZE = 0.034;
const SUPERPOSITION_BODY_BIND = 0.9;

export function TileCloudBody({ modelUrl, quantumState, mode, collapseProgress, tileCount = 18000 }: TileCloudBodyProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const tilesRef = useRef<TileState[]>([]);
  const [tilesReady, setTilesReady] = useState(false);
  const geometry = useMemo(() => new BoxGeometry(TILE_SIZE, TILE_SIZE, TILE_SIZE), []);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: "#dcecff",
        emissive: "#17304f",
        emissiveIntensity: 0.16,
        roughness: 0.62,
        metalness: 0.08,
        vertexColors: true,
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    sampleGlbToTiles(modelUrl, tileCount).then((tiles) => {
      if (cancelled) return;
      tilesRef.current = tiles;
      setTilesReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [modelUrl, tileCount]);

  useEffect(() => {
    const boosts = new Map<string, number>();
    for (const link of quantumState.entanglementLinks) {
      boosts.set(link.source, Math.max(boosts.get(link.source) ?? 0, link.strength * 0.45));
      boosts.set(link.target, Math.max(boosts.get(link.target) ?? 0, link.strength * 0.45));
    }

    for (const tile of tilesRef.current) {
      const state = quantumState.regionStates[tile.region];
      tile.activation = Math.min(1, state.activation + (boosts.get(tile.region) ?? 0));
      tile.coherence = state.coherence;
      tile.displacement = state.displacement;
    }
  }, [quantumState]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  }, [tilesReady]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    const tiles = tilesRef.current;
    if (!mesh || tiles.length === 0) return;

    const elapsed = clock.getElapsedTime();

    for (let index = 0; index < tiles.length; index += 1) {
      const tile = tiles[index];
      tile.collapseProgress = collapseProgress;
      reusableTarget.fromArray(tile.targetPosition);
      reusableScattered.fromArray(tile.scatteredPosition);
      reusableCurrent.fromArray(tile.currentPosition);

      const pulse = Math.sin(elapsed * 2.1 + index * 0.013) * 0.5 + 0.5;
      const noise = mode === "collapse" ? (1 - collapseProgress) * 0.035 : 0.018 + 0.035 * (1 - tile.coherence);
      const cluster = Math.min(1, SUPERPOSITION_BODY_BIND + tile.activation * 0.08 + collapseProgress);
      const destination = mode === "collapse" ? reusableTarget : reusableScattered.lerp(reusableTarget, cluster);
      destination.x += Math.sin(elapsed * 1.7 + index) * noise + tile.displacement * 0.08;
      destination.y += Math.cos(elapsed * 1.3 + index * 0.7) * noise;
      destination.z += Math.sin(elapsed * 1.1 + index * 0.31) * noise;

      reusableCurrent.lerp(destination, mode === "collapse" ? 0.08 + collapseProgress * 0.2 : 0.055);
      tile.currentPosition = reusableCurrent.toArray();

      const scale = 0.82 + tile.activation * 0.85 + pulse * tile.coherence * 0.22;
      reusableObject.position.copy(reusableCurrent);
      reusableObject.scale.setScalar(scale);
      if (mode === "collapse") {
        reusableQuaternion.identity();
        reusableObject.quaternion.slerp(reusableQuaternion, collapseProgress);
      } else {
        reusableObject.rotation.set(
          Math.sin(elapsed * 0.7 + index * 0.11) * 0.18,
          Math.cos(elapsed * 0.6 + index * 0.07) * 0.18,
          Math.sin(elapsed * 0.5 + index * 0.05) * 0.12,
        );
      }
      reusableObject.updateMatrix();
      mesh.setMatrixAt(index, reusableObject.matrix);

      reusableColor.setRGB(0.28 + tile.activation * 0.72, 0.56 + tile.coherence * 0.38, 0.78 + tile.activation * 0.18);
      mesh.setColorAt(index, reusableColor);
    }

    if (tiles.length < mesh.count) {
      reusableMatrix.makeScale(0, 0, 0);
      for (let index = tiles.length; index < mesh.count; index += 1) {
        mesh.setMatrixAt(index, reusableMatrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, Math.max(tileCount, tilesRef.current.length || tileCount)]} frustumCulled={false} />;
}

const reusableObject = new Object3D();
const reusableColor = new Color();
const reusableTarget = new Vector3();
const reusableScattered = new Vector3();
const reusableCurrent = new Vector3();
const reusableMatrix = new Matrix4();
const reusableQuaternion = new Quaternion();
