"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdditiveBlending, BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, Quaternion, Vector3, type Vector3Tuple } from "three";

import { type BodyQuantumState, type TileState } from "../lib/bodyRegions";
import { loadPrecomputedTiles } from "../lib/loadPrecomputedTiles";

type TileCloudBodyProps = {
  quantumState: BodyQuantumState;
  mode: "superposition" | "collapse";
  collapseProgress: number;
  tileCount?: number;
  tileDataUrl?: string;
};

const TILE_SIZE = 0.034;
const SLICE_COUNT = 34;
const SLICE_Y_SEGMENTS = 86;
const SUPERPOSITION_BODY_BIND = 0.9;
const BODY_SCALE = 0.74;

export function TileCloudBody({ quantumState, mode, collapseProgress, tileCount = 18000, tileDataUrl = "/data/astronaut-tile-cloud-18000.json" }: TileCloudBodyProps) {
  const tileMeshRef = useRef<InstancedMesh>(null);
  const sliceMeshRef = useRef<InstancedMesh>(null);
  const tilesRef = useRef<TileState[]>([]);
  const slicesRef = useRef<SliceState[]>([]);
  const [tilesReady, setTilesReady] = useState(false);
  const tileGeometry = useMemo(() => new BoxGeometry(TILE_SIZE, TILE_SIZE, TILE_SIZE), []);
  const sliceGeometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const tileMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: "#fbfbf8",
        emissive: "#c4c4bc",
        emissiveIntensity: 0.08,
        roughness: 0.2,
        metalness: 0.88,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
      }),
    [],
  );
  const sliceMaterial = useMemo(() => {
    const material = new MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#cecec6",
      emissiveIntensity: 0.06,
      roughness: 0.18,
      metalness: 0.94,
      vertexColors: true,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return material;
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadPrecomputedTiles(tileDataUrl)
      .then((tiles) => {
        if (cancelled) return;
        const selectedTiles = tiles.slice(0, tileCount);
        tilesRef.current = selectedTiles;
        slicesRef.current = buildSlices(selectedTiles);
        setTilesReady(true);
      })
      .catch((error) => {
        if (cancelled) return;
        throw error;
      });

    return () => {
      cancelled = true;
    };
  }, [tileCount, tileDataUrl]);

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

    for (const slice of slicesRef.current) {
      const state = quantumState.regionStates[slice.region];
      slice.activation = Math.min(1, state.activation + (boosts.get(slice.region) ?? 0));
      slice.coherence = state.coherence;
      slice.displacement = state.displacement;
    }
  }, [quantumState]);

  useEffect(() => {
    const tileMesh = tileMeshRef.current;
    const sliceMesh = sliceMeshRef.current;
    if (tileMesh) tileMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    if (sliceMesh) sliceMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  }, [tilesReady]);

  useFrame(({ clock }) => {
    const tileMesh = tileMeshRef.current;
    const sliceMesh = sliceMeshRef.current;
    const tiles = tilesRef.current;
    const slices = slicesRef.current;
    if (!tileMesh || !sliceMesh || tiles.length === 0 || slices.length === 0) return;

    const elapsed = clock.getElapsedTime();

    for (let index = 0; index < slices.length; index += 1) {
      const slice = slices[index];
      const wave = Math.sin(elapsed * 1.35 + slice.sliceIndex * 0.42 + slice.segmentIndex * 0.09) * 0.5 + 0.5;
      const superposition = 1 - collapseProgress;
      const probabilityGap = superposition * (0.2 + (1 - slice.coherence) * 0.75);
      const shimmer = wave * probabilityGap * 0.028;

      reusableObject.position.fromArray(slice.center);
      reusableObject.position.x += Math.sin(elapsed * 1.05 + slice.segmentIndex * 0.23) * shimmer + slice.displacement * 0.045;
      reusableObject.position.z += Math.cos(elapsed * 0.88 + slice.sliceIndex * 0.31) * shimmer;
      reusableObject.rotation.set(0, Math.sin(elapsed * 0.4 + slice.sliceIndex * 0.2) * 0.055 * superposition, 0);
      reusableObject.scale.set(slice.width * (0.82 + slice.activation * 0.22), slice.height, slice.depth * (0.78 + wave * 0.22));
      reusableObject.updateMatrix();
      sliceMesh.setMatrixAt(index, reusableObject.matrix);

      const shine = 0.86 + slice.activation * 0.08 + slice.coherence * 0.05;
      reusableColor.setRGB(shine, shine, shine * 0.96);
      sliceMesh.setColorAt(index, reusableColor);
    }

    if (slices.length < sliceMesh.count) {
      reusableMatrix.makeScale(0, 0, 0);
      for (let index = slices.length; index < sliceMesh.count; index += 1) {
        sliceMesh.setMatrixAt(index, reusableMatrix);
      }
    }

    for (let index = 0; index < tiles.length; index += 1) {
      const tile = tiles[index];
      tile.collapseProgress = collapseProgress;
      reusableTarget.fromArray(tile.targetPosition);
      reusableScattered.fromArray(tile.scatteredPosition);
      reusableCurrent.fromArray(tile.currentPosition);

      const pulse = Math.sin(elapsed * 2.1 + index * 0.013) * 0.5 + 0.5;
      const sliceGap = Math.sin(index * 12.9898) * 0.05;
      const noise = mode === "collapse" ? (1 - collapseProgress) * 0.03 : 0.026 + 0.055 * (1 - tile.coherence);
      const cluster = Math.min(1, SUPERPOSITION_BODY_BIND + tile.activation * 0.08 + collapseProgress);
      const destination = mode === "collapse" ? reusableTarget : reusableScattered.lerp(reusableTarget, cluster);
      destination.x += Math.sin(elapsed * 1.7 + index) * noise + tile.displacement * 0.08;
      destination.y += Math.cos(elapsed * 1.3 + index * 0.7) * noise;
      destination.z += Math.sin(elapsed * 1.1 + index * 0.31) * noise + sliceGap * (1 - collapseProgress);

      reusableCurrent.lerp(destination, mode === "collapse" ? 0.08 + collapseProgress * 0.2 : 0.055);
      tile.currentPosition = reusableCurrent.toArray();

      const scale = 0.48 + tile.activation * 0.72 + pulse * tile.coherence * 0.18;
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
      tileMesh.setMatrixAt(index, reusableObject.matrix);

      const silver = 0.84 + tile.activation * 0.08 + tile.coherence * 0.05;
      reusableColor.setRGB(silver, silver, silver * 0.96);
      tileMesh.setColorAt(index, reusableColor);
    }

    if (tiles.length < tileMesh.count) {
      reusableMatrix.makeScale(0, 0, 0);
      for (let index = tiles.length; index < tileMesh.count; index += 1) {
        tileMesh.setMatrixAt(index, reusableMatrix);
      }
    }

    sliceMesh.instanceMatrix.needsUpdate = true;
    if (sliceMesh.instanceColor) sliceMesh.instanceColor.needsUpdate = true;
    tileMesh.instanceMatrix.needsUpdate = true;
    if (tileMesh.instanceColor) tileMesh.instanceColor.needsUpdate = true;
  });

  return (
    <group scale={BODY_SCALE}>
      <instancedMesh ref={sliceMeshRef} args={[sliceGeometry, sliceMaterial, SLICE_COUNT * SLICE_Y_SEGMENTS]} frustumCulled={false} />
      <instancedMesh ref={tileMeshRef} args={[tileGeometry, tileMaterial, Math.max(tileCount, tilesRef.current.length || tileCount)]} frustumCulled={false} />
    </group>
  );
}

type SliceState = {
  center: Vector3Tuple;
  width: number;
  height: number;
  depth: number;
  sliceIndex: number;
  segmentIndex: number;
  region: TileState["region"];
  activation: number;
  coherence: number;
  displacement: number;
};

const reusableObject = new Object3D();
const reusableColor = new Color();
const reusableTarget = new Vector3();
const reusableScattered = new Vector3();
const reusableCurrent = new Vector3();
const reusableMatrix = new Matrix4();
const reusableQuaternion = new Quaternion();

function buildSlices(tiles: TileState[]): SliceState[] {
  if (tiles.length === 0) return [];

  const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

  for (const tile of tiles) {
    reusableTarget.fromArray(tile.targetPosition);
    min.min(reusableTarget);
    max.max(reusableTarget);
  }

  const xRange = Math.max(0.001, max.x - min.x);
  const yRange = Math.max(0.001, max.y - min.y);
  const sliceWidth = xRange / SLICE_COUNT;
  const segmentHeight = yRange / SLICE_Y_SEGMENTS;
  const buckets = new Map<string, SliceBucket>();

  for (const tile of tiles) {
    const [x, y, z] = tile.targetPosition;
    const sliceIndex = clampIndex(Math.floor(((x - min.x) / xRange) * SLICE_COUNT), SLICE_COUNT);
    const segmentIndex = clampIndex(Math.floor(((y - min.y) / yRange) * SLICE_Y_SEGMENTS), SLICE_Y_SEGMENTS);
    const key = `${sliceIndex}:${segmentIndex}:${tile.region}`;
    const bucket =
      buckets.get(key) ??
      {
        x: 0,
        y: 0,
        z: 0,
        count: 0,
        sliceIndex,
        segmentIndex,
        region: tile.region,
      };

    bucket.x += min.x + sliceWidth * (sliceIndex + 0.5);
    bucket.y += y;
    bucket.z += z;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.count >= 2)
    .map((bucket) => {
      const density = Math.min(1, bucket.count / 9);
      return {
        center: [bucket.x / bucket.count, bucket.y / bucket.count, bucket.z / bucket.count],
        width: sliceWidth * (0.44 + density * 0.42),
        height: segmentHeight * (0.7 + density * 1.8),
        depth: 0.018 + density * 0.018,
        sliceIndex: bucket.sliceIndex,
        segmentIndex: bucket.segmentIndex,
        region: bucket.region,
        activation: 0,
        coherence: 0.18,
        displacement: 0,
      };
    });
}

type SliceBucket = {
  x: number;
  y: number;
  z: number;
  count: number;
  sliceIndex: number;
  segmentIndex: number;
  region: TileState["region"];
};

function clampIndex(index: number, count: number) {
  return Math.max(0, Math.min(count - 1, index));
}
