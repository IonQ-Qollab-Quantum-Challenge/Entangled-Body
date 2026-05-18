"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdditiveBlending, Box3, BufferGeometry, Float32BufferAttribute, Material, Mesh, NormalBlending, Object3D, PointsMaterial, SkinnedMesh, Vector3, type Vector3Tuple } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";

import type { BodyRegion } from "../lib/bodyRegions";

const GROUND_Y = -1.48;
const SURFACE_POINT_COUNT = 42000;
const SURFACE_POINT_OFFSET = 0.003;
const SURFACE_LINE_LIMIT = 20000;
const SURFACE_LINE_MAX_DISTANCE = 0.18;
const FIXED_POINT_RANDOM_LINE_COUNT = 1000;
const FIXED_POINT_RANDOM_LINE_RADIUS = 0.68;
const NERVOUS_LINE_RADIUS = 0.72;
const NERVOUS_PATH_RADIUS = 0.2;
const NERVOUS_TRUNK_SEGMENTS = 12;
const HOVER_COLOR_RADIUS = 0.72;

type OriginalGlbModelProps = {
  modelUrl: string;
  hoveredRegion: BodyRegion | null;
  hoveredPoint: Vector3Tuple | null;
  onHoverRegion: (region: BodyRegion | null, point?: Vector3Tuple) => void;
  onMeasureRegion: (region: BodyRegion, point?: Vector3Tuple, nodeIndex?: number) => void;
  onGlobalCollapse: () => void;
  onReady?: () => void;
  stable: boolean;
  stablePoint: Vector3Tuple | null;
  stableProgress: number;
  connectionBreakPoint: Vector3Tuple | null;
  connectionBreakProgress: number;
  opacity?: number;
  waveStrength?: number;
};

type LoadedModel = {
  scene: Object3D;
  position: [number, number, number];
  scale: number;
  bindings: WaveMaterialBinding[];
  surfacePointGeometry: BufferGeometry;
  surfaceGlowPointGeometry: BufferGeometry;
  surfaceLineGeometry: BufferGeometry;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

type WaveMaterialBinding = {
  mesh: Mesh;
  material: WaveMaterial;
};

type WaveMaterial = Material & {
  userData: {
    entangledUniforms?: Record<string, { value: number | Vector3 }>;
  };
};

type MaskedPointMaterial = PointsMaterial & {
  userData: {
    hoverMaskUniforms?: Record<string, { value: number | Vector3 }>;
  };
};

type MutableNumberArray = {
  length: number;
  [index: number]: number;
};

type FixedRegionLabel =
  | "node0"
  | "node1"
  | "node2"
  | "node3"
  | "node4"
  | "node5"
  | "node6"
  | "node7"
  | "node8"
  | "node9"
  | "node10"
  | "node11"
  | "node12"
  | "node13";

type FixedRegionPoint = {
  label: FixedRegionLabel;
  position: [number, number, number];
};

type FixedPointWhiteCandidate = {
  index: number;
  x: number;
  y: number;
  z: number;
  angle: number;
  distanceSq: number;
};

const FIXED_REGION_CONNECTIONS: Record<FixedRegionLabel, FixedRegionLabel[]> = {
  node0: ["node1", "node3"],
  node1: ["node0", "node2", "node3", "node4", "node5"],
  node2: ["node1", "node3", "node10", "node11"],
  node3: ["node0", "node1", "node2", "node4", "node5"],
  node4: ["node1", "node3", "node6"],
  node5: ["node1", "node3", "node7"],
  node6: ["node4", "node8"],
  node7: ["node5", "node9"],
  node8: ["node6"],
  node9: ["node7"],
  node10: ["node2", "node12"],
  node11: ["node2", "node13"],
  node12: ["node10"],
  node13: ["node11"],
};

const FIXED_REGION_BODY_REGIONS: Record<FixedRegionLabel, BodyRegion> = {
  node0: "head",
  node1: "chest",
  node2: "torso",
  node3: "oxygenTank",
  node4: "rightShoulder",
  node5: "leftShoulder",
  node6: "rightArm",
  node7: "leftArm",
  node8: "rightHand",
  node9: "leftHand",
  node10: "rightLeg",
  node11: "leftLeg",
  node12: "rightFoot",
  node13: "leftFoot",
};

export function OriginalGlbModel({
  modelUrl,
  hoveredRegion,
  hoveredPoint,
  onHoverRegion,
  onMeasureRegion,
  onGlobalCollapse,
  onReady,
  stable,
  stablePoint,
  stableProgress,
  connectionBreakPoint,
  connectionBreakProgress,
  opacity = 0.34,
  waveStrength = 1,
}: OriginalGlbModelProps) {
  const [model, setModel] = useState<LoadedModel | null>(null);
  const holdTimer = useRef<number | null>(null);
  const surfaceGlowMaterial = useMemo(
    () => prepareMaskedPointMaterial({ size: 0.042, opacity: 0.05, blending: AdditiveBlending }),
    [],
  );
  const surfacePointMaterial = useMemo(
    () => prepareMaskedPointMaterial({ size: 0.015, opacity: 0.68 }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();

    loader.loadAsync(modelUrl).then((gltf) => {
      if (cancelled) return;

      const scene = gltf.scene;
      scene.updateMatrixWorld(true);
      const bindings: WaveMaterialBinding[] = [];

      scene.traverse((object) => {
        object.frustumCulled = false;
        const mesh = object as Mesh;
        if (!mesh.isMesh || !mesh.material) return;

        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((material) => prepareMaterial(material, opacity));
          for (const material of mesh.material) {
            bindings.push({ mesh, material });
          }
        } else {
          mesh.material = prepareMaterial(mesh.material, opacity);
          bindings.push({ mesh, material: mesh.material });
        }
      });

      const box = new Box3().setFromObject(scene);
      const center = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3());
      const scale = 2.45 / Math.max(size.x, size.y, size.z, 0.001);
      const surfaceGeometry = sampleSurfaceGeometry(scene, SURFACE_POINT_COUNT);

      setModel({
        scene,
        scale,
        bindings,
        surfacePointGeometry: surfaceGeometry.pointGeometry,
        surfaceGlowPointGeometry: surfaceGeometry.glowPointGeometry,
        surfaceLineGeometry: surfaceGeometry.lineGeometry,
        minX: box.min.x,
        maxX: box.max.x,
        minY: box.min.y,
        maxY: box.max.y,
        minZ: box.min.z,
        maxZ: box.max.z,
        position: [-center.x * scale, GROUND_Y - box.min.y * scale, -center.z * scale],
      });
      onReady?.();
    });

    return () => {
      cancelled = true;
    };
  }, [modelUrl, onReady, opacity]);

  useEffect(() => {
    return () => {
      model?.surfacePointGeometry.dispose();
      model?.surfaceGlowPointGeometry.dispose();
      model?.surfaceLineGeometry.dispose();
    };
  }, [model]);

  useEffect(() => {
    return () => {
      surfaceGlowMaterial.dispose();
      surfacePointMaterial.dispose();
    };
  }, [surfaceGlowMaterial, surfacePointMaterial]);

  useFrame(({ clock }) => {
    if (!model) return;

    const elapsed = clock.getElapsedTime();
    const breath = Math.sin(elapsed * 1.55) * 0.5 + 0.5;
    const revealComplete = stable && stableProgress >= 0.995;
    const effectiveOpacity = revealComplete ? 1 : Math.max(0.07, Math.min(0.42, opacity + breath * 0.028));
    const effectiveWaveStrength = revealComplete ? 0 : waveStrength;
    const hasHoverPoint = !stable && hoveredPoint ? 1 : 0;
    const hasStablePoint = stable && stablePoint ? 1 : 0;
    const surfaceInteractionPoint = stable && stablePoint ? stablePoint : hoveredPoint;

    updateSurfaceGlowPointColors(model.surfaceGlowPointGeometry, model.scene, surfaceInteractionPoint);
    updateMaskedPointMaterial(surfaceGlowMaterial, surfaceInteractionPoint, model.scene, surfaceGlowOpacityForFrame(stable, stableProgress, hoveredPoint, stablePoint));
    updateMaskedPointMaterial(surfacePointMaterial, surfaceInteractionPoint, model.scene, surfacePointOpacityForFrame(stable, stableProgress, hoveredPoint, stablePoint));
    for (const binding of model.bindings) {
      const material = binding.material;
      material.opacity = effectiveOpacity;
      material.transparent = !revealComplete;
      material.depthWrite = true;
      material.needsUpdate = true;
      const uniforms = material.userData.entangledUniforms;
      if (!uniforms) continue;

      const localHover = reusableHoverPoint;
      if (hoveredPoint) {
        localHover.fromArray(hoveredPoint);
        binding.mesh.worldToLocal(localHover);
      }
      const localStable = reusableStablePoint;
      if (stablePoint) {
        localStable.fromArray(stablePoint);
        binding.mesh.worldToLocal(localStable);
      }
      uniforms.uTime.value = elapsed;
      uniforms.uHoveredRegion.value = regionToId(hoveredRegion);
      uniforms.uHasHoverPoint.value = hasHoverPoint;
      uniforms.uHoverPoint.value = localHover;
      uniforms.uHoverRadius.value = 1.0;
      uniforms.uHasStablePoint.value = hasStablePoint;
      uniforms.uStablePoint.value = localStable;
      uniforms.uStableProgress.value = stableProgress;
      uniforms.uWaveStrength.value = effectiveWaveStrength;
      uniforms.uBaseOpacity.value = material.opacity;
    }
  });

  if (!model) return null;

  const surfaceFade = stable ? 1 - smoothstep(0.08, 0.82, stableProgress) : 1;
  const activeFixedPointSource = connectionBreakPoint ?? (stable && stablePoint ? stablePoint : hoveredPoint);
  const showFullEntanglement = Boolean(hoveredPoint || connectionBreakPoint || stablePoint);
  const disconnectEntanglement = Boolean(connectionBreakPoint);

  function clearHoldTimer() {
    if (holdTimer.current === null) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  function nodeHitFromEvent(event: ThreeEvent<PointerEvent>): { region: BodyRegion; point: Vector3Tuple; nodeIndex: number } | null {
    if (!model) return null;
    const points = getFixedRegionPoints(model);
    const nodeIndex = findNearestFixedRegionPointIndex(points, model.scene, event);
    const node = points[nodeIndex];
    return {
      region: FIXED_REGION_BODY_REGIONS[node.label],
      point: event.point.toArray() as Vector3Tuple,
      nodeIndex,
    };
  }

  return (
    <group position={model.position} scale={model.scale}>
      {surfaceFade > 0.001 ? (
        <>
          <points geometry={model.surfaceGlowPointGeometry} frustumCulled={false} renderOrder={3} raycast={ignorePointRaycast}>
            <primitive object={surfaceGlowMaterial} attach="material" />
          </points>
          <points geometry={model.surfacePointGeometry} frustumCulled={false} renderOrder={4} raycast={ignorePointRaycast}>
            <primitive object={surfacePointMaterial} attach="material" />
          </points>
        </>
      ) : null}
      <FixedRegionPoints
        model={model}
        interactionPoint={activeFixedPointSource}
        connectAll={showFullEntanglement}
        connectionProgress={disconnectEntanglement ? connectionBreakProgress : 1}
        disconnect={disconnectEntanglement}
        pointOpacity={disconnectEntanglement ? 1 - connectionBreakProgress : 1}
      />
      <primitive
        object={model.scene}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          const hit = nodeHitFromEvent(event);
          if (!hit) return;
          onHoverRegion(hit.region, hit.point);
        }}
        onPointerDown={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          clearHoldTimer();
          holdTimer.current = window.setTimeout(() => {
            holdTimer.current = null;
            onGlobalCollapse();
          }, 650);
        }}
        onPointerUp={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          const hit = nodeHitFromEvent(event);
          if (holdTimer.current !== null && hit) {
            clearHoldTimer();
            onMeasureRegion(hit.region, hit.point, hit.nodeIndex);
          }
        }}
        onPointerLeave={() => {
          clearHoldTimer();
          onHoverRegion(null);
        }}
      />
    </group>
  );
}

function FixedRegionPoints({
  model,
  interactionPoint,
  connectAll,
  connectionProgress,
  disconnect,
  pointOpacity,
}: {
  model: LoadedModel;
  interactionPoint: Vector3Tuple | null;
  connectAll: boolean;
  connectionProgress: number;
  disconnect: boolean;
  pointOpacity: number;
}) {
  const points = useMemo(() => getFixedRegionPoints(model), [model]);
  const networkGeometry = useMemo(
    () => createFixedRegionNetworkGeometry(points, model.scene, interactionPoint, connectAll, connectionProgress, disconnect),
    [connectAll, connectionProgress, disconnect, interactionPoint, model.scene, points],
  );

  return (
    <group renderOrder={40}>
      {networkGeometry ? (
        <>
          <lineSegments geometry={networkGeometry} frustumCulled={false} renderOrder={41} raycast={ignorePointRaycast}>
            <lineBasicMaterial color="#1fbfff" transparent opacity={0.54} blending={AdditiveBlending} depthTest={false} depthWrite={false} toneMapped={false} />
          </lineSegments>
          <lineSegments geometry={networkGeometry} frustumCulled={false} renderOrder={42} raycast={ignorePointRaycast}>
            <lineBasicMaterial color="#b8f4ff" transparent opacity={0.96} blending={NormalBlending} depthTest={false} depthWrite={false} toneMapped={false} />
          </lineSegments>
        </>
      ) : null}
      {pointOpacity > 0.001
        ? points.map((point) => (
            <group key={point.label} position={point.position}>
              <mesh renderOrder={40} raycast={ignorePointRaycast}>
                <sphereGeometry args={[0.026, 16, 16]} />
                <meshBasicMaterial color="#9beaff" transparent opacity={0.96 * pointOpacity} depthTest={false} depthWrite={false} toneMapped={false} />
              </mesh>
              <mesh renderOrder={39} raycast={ignorePointRaycast}>
                <sphereGeometry args={[0.072, 16, 16]} />
                <meshBasicMaterial color="#1fbfff" transparent opacity={0.22 * pointOpacity} blending={AdditiveBlending} depthTest={false} depthWrite={false} toneMapped={false} />
              </mesh>
            </group>
          ))
        : null}
    </group>
  );
}

function getFixedRegionPoints(model: LoadedModel): FixedRegionPoint[] {
  const width = Math.max(0.001, model.maxX - model.minX);
  const height = Math.max(0.001, model.maxY - model.minY);
  const depth = Math.max(0.001, model.maxZ - model.minZ);
  const centerX = (model.minX + model.maxX) * 0.5;
  const centerZ = (model.minZ + model.maxZ) * 0.5;
  const frontZ = centerZ + depth * 0.22;
  const backZ = centerZ - depth * 0.24;
  const y = (ratio: number, offset = 0) => model.minY + height * (ratio + 0.035 + offset);
  const x = (ratio: number) => centerX + width * ratio;

  return [
    { label: "node0", position: [centerX, y(0.86), frontZ] },
    { label: "node1", position: [centerX, y(0.66), frontZ] },
    { label: "node2", position: [centerX, y(0.52), frontZ] },
    { label: "node3", position: [centerX, y(0.61), backZ] },
    { label: "node4", position: [x(-0.23), y(0.7), centerZ] },
    { label: "node5", position: [x(0.23), y(0.7), centerZ] },
    { label: "node6", position: [x(-0.36), y(0.57), centerZ] },
    { label: "node7", position: [x(0.36), y(0.57), centerZ] },
    { label: "node8", position: [x(-0.43), y(0.39, 0.035), frontZ] },
    { label: "node9", position: [x(0.43), y(0.39, 0.035), frontZ] },
    { label: "node10", position: [x(-0.13), y(0.28), centerZ] },
    { label: "node11", position: [x(0.13), y(0.28), centerZ] },
    { label: "node12", position: [x(-0.14), y(0.04, -0.035), frontZ] },
    { label: "node13", position: [x(0.14), y(0.04, -0.035), frontZ] },
  ];
}

function createFixedRegionNetworkGeometry(
  points: FixedRegionPoint[],
  scene: Object3D,
  interactionPoint: Vector3Tuple | null,
  connectAll: boolean,
  connectionProgress: number,
  disconnect: boolean,
): BufferGeometry | null {
  const segments: number[] = [];

  if (connectAll) {
    const source = interactionPoint ? findNearestFixedRegionPointFromWorld(points, scene, interactionPoint) : null;
    pushAllFixedRegionConnections(segments, points, connectionProgress, source, disconnect);
  } else {
    const path = getFixedRegionPath(points, scene, interactionPoint);
    if (path.length < 2) return null;

    for (let index = 0; index < path.length - 1; index += 1) {
      pushFixedRegionSegment(segments, path[index], path[index + 1]);
    }
  }

  if (segments.length === 0) return null;

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(segments, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function getFixedRegionPath(points: FixedRegionPoint[], scene: Object3D, interactionPoint: Vector3Tuple | null): FixedRegionPoint[] {
  if (!interactionPoint) return [];

  reusableFixedInteraction.fromArray(interactionPoint);
  scene.worldToLocal(reusableFixedInteraction);

  const source = findNearestFixedRegionPoint(points, reusableFixedInteraction);
  const firstTarget = findNearestConnectedFixedRegionPoint(points, source.label);
  if (!firstTarget) return [source];
  const secondTarget = findNearestConnectedFixedRegionPoint(points, firstTarget.label, source.label);
  const thirdTarget = secondTarget ? findNearestConnectedFixedRegionPoint(points, secondTarget.label, firstTarget.label) : null;

  return [source, firstTarget, secondTarget, thirdTarget].filter((point): point is FixedRegionPoint => Boolean(point));
}

function pushAllFixedRegionConnections(
  segments: number[],
  points: FixedRegionPoint[],
  connectionProgress: number,
  source: FixedRegionPoint | null,
  disconnect: boolean,
): void {
  const pointByLabel = new Map(points.map((point) => [point.label, point]));
  const usedEdges = new Set<string>();
  const edges: Array<[FixedRegionPoint, FixedRegionPoint]> = [];
  const graphDistances = source ? getFixedRegionGraphDistances(source.label) : null;

  for (const point of points) {
    for (const targetLabel of FIXED_REGION_CONNECTIONS[point.label]) {
      const edgeKey = [point.label, targetLabel].sort().join(":");
      if (usedEdges.has(edgeKey)) continue;

      const target = pointByLabel.get(targetLabel);
      if (!target) continue;
      usedEdges.add(edgeKey);
      edges.push([point, target]);
    }
  }

  const orderedEdges = edges.sort((left, right) => {
    const leftScore = fixedRegionRevealScore(left[0], left[1], graphDistances);
    const rightScore = fixedRegionRevealScore(right[0], right[1], graphDistances);
    return leftScore - rightScore;
  });
  const progress = Math.max(0, Math.min(1, connectionProgress));
  const hiddenEdgeCount = disconnect ? Math.floor(orderedEdges.length * progress) : 0;
  const visibleEdgeCount = disconnect ? orderedEdges.length : Math.min(orderedEdges.length, Math.ceil(orderedEdges.length * progress));

  for (let index = hiddenEdgeCount; index < visibleEdgeCount; index += 1) {
    pushFixedRegionSegment(segments, orderedEdges[index][0], orderedEdges[index][1]);
  }
}

function fixedRegionRevealScore(left: FixedRegionPoint, right: FixedRegionPoint, graphDistances: Map<FixedRegionLabel, number> | null): number {
  if (graphDistances) {
    const leftDistance = graphDistances.get(left.label) ?? Number.POSITIVE_INFINITY;
    const rightDistance = graphDistances.get(right.label) ?? Number.POSITIVE_INFINITY;
    return Math.min(leftDistance, rightDistance) * 10 + Math.max(leftDistance, rightDistance);
  }

  const centerY = (left.position[1] + right.position[1]) * 0.5;
  const centerX = Math.abs((left.position[0] + right.position[0]) * 0.5);
  return centerY * -1 + centerX * 0.08;
}

function getFixedRegionGraphDistances(source: FixedRegionLabel): Map<FixedRegionLabel, number> {
  const distances = new Map<FixedRegionLabel, number>([[source, 0]]);
  const queue: FixedRegionLabel[] = [source];

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const current = queue[queueIndex];
    const currentDistance = distances.get(current) ?? 0;

    for (const next of FIXED_REGION_CONNECTIONS[current]) {
      if (distances.has(next)) continue;
      distances.set(next, currentDistance + 1);
      queue.push(next);
    }
  }

  return distances;
}

function findNearestFixedRegionPointFromWorld(points: FixedRegionPoint[], scene: Object3D, worldPoint: Vector3Tuple): FixedRegionPoint {
  reusableFixedInteraction.fromArray(worldPoint);
  scene.worldToLocal(reusableFixedInteraction);
  return findNearestFixedRegionPoint(points, reusableFixedInteraction);
}

function findNearestFixedRegionPoint(points: FixedRegionPoint[], target: Vector3): FixedRegionPoint {
  let nearest = points[0];
  let nearestDistanceSq = Infinity;

  for (const point of points) {
    const distanceSq = distanceSqToFixedPoint(point, target.x, target.y, target.z);
    if (distanceSq < nearestDistanceSq) {
      nearest = point;
      nearestDistanceSq = distanceSq;
    }
  }

  return nearest;
}

function findNearestFixedRegionPointIndex(points: FixedRegionPoint[], scene: Object3D, event: ThreeEvent<PointerEvent>): number {
  let nearestIndex = 0;
  let nearestScore = Infinity;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    reusableFixedWorldPoint.fromArray(point.position);
    scene.localToWorld(reusableFixedWorldPoint);

    const rayDistance = event.ray.distanceSqToPoint(reusableFixedWorldPoint);
    const cameraDistance = event.camera.position.distanceToSquared(reusableFixedWorldPoint);
    const oxygenTankBias = point.label === "node3" ? 0.72 : 1;
    const score = (rayDistance * 12 + cameraDistance * 0.018) * oxygenTankBias;

    if (score < nearestScore) {
      nearestIndex = index;
      nearestScore = score;
    }
  }

  return nearestIndex;
}

function findNearestConnectedFixedRegionPoint(points: FixedRegionPoint[], sourceLabel: FixedRegionLabel, excludeLabel?: FixedRegionLabel): FixedRegionPoint | null {
  const source = points.find((point) => point.label === sourceLabel);
  if (!source) return null;

  let nearest: FixedRegionPoint | null = null;
  let nearestDistanceSq = Infinity;
  const connectedLabels = FIXED_REGION_CONNECTIONS[sourceLabel] ?? [];

  for (const label of connectedLabels) {
    if (label === excludeLabel) continue;
    const candidate = points.find((point) => point.label === label);
    if (!candidate) continue;
    const distanceSq = distanceSqBetweenFixedPoints(source, candidate);
    if (distanceSq < nearestDistanceSq) {
      nearest = candidate;
      nearestDistanceSq = distanceSq;
    }
  }

  if (!nearest && excludeLabel) return findNearestConnectedFixedRegionPoint(points, sourceLabel);
  return nearest;
}

function pushFixedRegionSegment(segments: number[], start: FixedRegionPoint, end: FixedRegionPoint): void {
  segments.push(...start.position, ...end.position);
}

function distanceSqToFixedPoint(point: FixedRegionPoint, x: number, y: number, z: number): number {
  return (point.position[0] - x) ** 2 + (point.position[1] - y) ** 2 + (point.position[2] - z) ** 2;
}

function distanceSqBetweenFixedPoints(left: FixedRegionPoint, right: FixedRegionPoint): number {
  return distanceSqToFixedPoint(left, right.position[0], right.position[1], right.position[2]);
}

function sampleSurfaceGeometry(scene: Object3D, pointCount: number): { pointGeometry: BufferGeometry; glowPointGeometry: BufferGeometry; lineGeometry: BufferGeometry } {
  scene.updateMatrixWorld(true);
  const sources = collectSurfaceSources(scene).map((mesh) => bakeSurfaceSource(scene, mesh));
  const totalWeight = sources.reduce((sum, source) => sum + source.weight, 0) || 1;
  const positions: number[] = [];
  const colors: number[] = [];
  const target = new Vector3();
  const normal = new Vector3();

  for (const source of sources) {
    const count = Math.max(1, Math.round((source.weight / totalWeight) * pointCount));
    const sampler = new MeshSurfaceSampler(source.bakedMesh).build();

    for (let index = 0; index < count && positions.length / 3 < pointCount; index += 1) {
      sampler.sample(target, normal);
      target.addScaledVector(normal, SURFACE_POINT_OFFSET);
      positions.push(target.x, target.y, target.z);
      colors.push(1, 1, 1);
    }

    source.bakedGeometry.dispose();
  }

  const pointGeometry = new BufferGeometry();
  pointGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  pointGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  pointGeometry.computeBoundingSphere();

  const glowPointGeometry = pointGeometry.clone();
  glowPointGeometry.setAttribute("color", new Float32BufferAttribute(new Float32Array(colors.length), 3));
  glowPointGeometry.computeBoundingSphere();

  return {
    pointGeometry,
    glowPointGeometry,
    lineGeometry: createNervousLineGeometry(),
  };
}

function createNervousLineGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(SURFACE_LINE_LIMIT * 6), 3));
  geometry.setDrawRange(0, 0);
  return geometry;
}

function updateSurfaceGlowPointColors(geometry: BufferGeometry, scene: Object3D, hoverPoint: Vector3Tuple | null): void {
  const positionAttribute = geometry.getAttribute("position");
  const colorAttribute = geometry.getAttribute("color");
  if (!positionAttribute || !colorAttribute) return;

  const positions = positionAttribute.array;
  const colors = colorAttribute.array;

  if (hoverPoint) {
    reusableSurfaceHover.fromArray(hoverPoint);
    scene.worldToLocal(reusableSurfaceHover);
  }

  for (let index = 0; index < positionAttribute.count; index += 1) {
    let influence = 0;
    if (hoverPoint) {
      const x = positions[index * 3];
      const y = positions[index * 3 + 1];
      const z = positions[index * 3 + 2];
      const distance = Math.hypot(x - reusableSurfaceHover.x, y - reusableSurfaceHover.y, z - reusableSurfaceHover.z);
      influence = 1 - smoothstep(HOVER_COLOR_RADIUS * 0.22, HOVER_COLOR_RADIUS, distance);
    }

    const glow = influence > 0.02 ? influence : 0;
    colors[index * 3] = glow;
    colors[index * 3 + 1] = glow;
    colors[index * 3 + 2] = glow;
  }

  colorAttribute.needsUpdate = true;
}

function updateNervousLineGeometry(
  lineGeometry: BufferGeometry,
  pointGeometry: BufferGeometry,
  interactionPoint: Vector3Tuple | null,
  elapsed: number,
  fixedRegionPath: Vector3Tuple[] | null,
): void {
  const lineAttribute = lineGeometry.getAttribute("position");
  const pointAttribute = pointGeometry.getAttribute("position");
  if (!lineAttribute || !pointAttribute) return;

  const linePositions = lineAttribute.array;
  const pointPositions = pointAttribute.array;

  if (!interactionPoint) {
    lineGeometry.setDrawRange(0, 0);
    lineAttribute.needsUpdate = true;
    return;
  }

  const pointCount = pointAttribute.count;
  const hasFixedPath = Boolean(fixedRegionPath && fixedRegionPath.length >= 2);
  const lineCount = hasFixedPath ? writeFixedRegionPointSpokes(linePositions, pointPositions, pointCount, fixedRegionPath, elapsed) : 0;

  lineGeometry.setDrawRange(0, lineCount * 2);
  lineGeometry.computeBoundingSphere();
  lineAttribute.needsUpdate = true;
}

function writeFixedRegionPointSpokes(
  linePositions: MutableNumberArray,
  pointPositions: ArrayLike<number>,
  pointCount: number,
  fixedRegionPath: Vector3Tuple[] | null,
  elapsed: number,
): number {
  if (!fixedRegionPath || fixedRegionPath.length < 2) return 0;

  let lineCount = 0;
  const whitePointCount = Math.floor(FIXED_POINT_RANDOM_LINE_COUNT / 2);

  for (let fixedIndex = 0; fixedIndex < fixedRegionPath.length && lineCount < SURFACE_LINE_LIMIT; fixedIndex += 1) {
    const [ax, ay, az] = fixedRegionPath[fixedIndex];
    const candidates = collectFixedPointWhiteCandidates(pointPositions, pointCount, ax, ay, az, fixedIndex, whitePointCount);
    if (candidates.length === 0) continue;

    for (const candidate of candidates) {
      if (lineCount >= SURFACE_LINE_LIMIT) return lineCount;
      const pulse = Math.sin(elapsed * 10.0 + candidate.index * 0.05 + fixedIndex) * 0.004;
      writeLineSegment(linePositions, lineCount, ax, ay, az, candidate.x, candidate.y + pulse, candidate.z);
      lineCount += 1;
    }

    for (let index = 0; index < candidates.length && lineCount < SURFACE_LINE_LIMIT; index += 1) {
      const current = candidates[index];
      const next = candidates[(index + 1) % candidates.length];
      const pulse = Math.sin(elapsed * 9.0 + current.index * 0.04 + fixedIndex) * 0.004;
      writeLineSegment(linePositions, lineCount, current.x, current.y + pulse, current.z, next.x, next.y - pulse, next.z);
      lineCount += 1;
    }
  }

  return lineCount;
}

function collectFixedPointWhiteCandidates(
  pointPositions: ArrayLike<number>,
  pointCount: number,
  ax: number,
  ay: number,
  az: number,
  fixedIndex: number,
  targetCount: number,
): FixedPointWhiteCandidate[] {
  const candidates: FixedPointWhiteCandidate[] = [];
  const minDistanceSq = 0.03 * 0.03;
  const primaryDistanceSq = FIXED_POINT_RANDOM_LINE_RADIUS * FIXED_POINT_RANDOM_LINE_RADIUS;
  const fallbackDistanceSq = (FIXED_POINT_RANDOM_LINE_RADIUS * 1.45) ** 2;
  collectFixedPointWhiteCandidatesWithinRadius(candidates, pointPositions, pointCount, ax, ay, az, fixedIndex, targetCount, minDistanceSq, primaryDistanceSq, 37);

  if (candidates.length < targetCount) {
    collectFixedPointWhiteCandidatesWithinRadius(candidates, pointPositions, pointCount, ax, ay, az, fixedIndex + 17, targetCount, minDistanceSq, fallbackDistanceSq, 53);
  }

  return candidates
    .sort((left, right) => left.angle - right.angle || left.distanceSq - right.distanceSq)
    .slice(0, targetCount);
}

function collectFixedPointWhiteCandidatesWithinRadius(
  candidates: FixedPointWhiteCandidate[],
  pointPositions: ArrayLike<number>,
  pointCount: number,
  ax: number,
  ay: number,
  az: number,
  fixedIndex: number,
  targetCount: number,
  minDistanceSq: number,
  maxDistanceSq: number,
  stepSize: number,
): void {
  const offset = Math.floor(nervousHash(fixedIndex * 97 + pointCount) * pointCount);
  const seen = new Set<number>(candidates.map((candidate) => candidate.index));

  for (let step = 0; step < pointCount && candidates.length < targetCount; step += 1) {
    const index = (offset + step * stepSize) % pointCount;
    if (seen.has(index)) continue;

    const x = pointPositions[index * 3];
    const y = pointPositions[index * 3 + 1];
    const z = pointPositions[index * 3 + 2];
    const dx = x - ax;
    const dy = y - ay;
    const dz = z - az;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq < minDistanceSq || distanceSq > maxDistanceSq) continue;

    seen.add(index);
    candidates.push({
      index,
      x,
      y,
      z,
      angle: Math.atan2(dy, dx + dz * 0.35),
      distanceSq,
    });
  }
}

function writeLineSegment(linePositions: MutableNumberArray, lineCount: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
  const writeIndex = lineCount * 6;
  linePositions[writeIndex] = ax;
  linePositions[writeIndex + 1] = ay;
  linePositions[writeIndex + 2] = az;
  linePositions[writeIndex + 3] = bx;
  linePositions[writeIndex + 4] = by;
  linePositions[writeIndex + 5] = bz;
}

function getFixedRegionPathActivation(path: Vector3Tuple[] | null, x: number, y: number, z: number, radius: number): number {
  return getFixedRegionPathMetrics(path, x, y, z, radius).activation;
}

function getFixedRegionPathMetrics(path: Vector3Tuple[] | null, x: number, y: number, z: number, radius: number): { activation: number; progress: number } {
  if (!path || path.length < 2) return { activation: 0, progress: 0 };

  let activation = 0;
  let pathProgress = 0;
  reusableFixedPathPoint.set(x, y, z);

  for (let index = 0; index < path.length - 1; index += 1) {
    reusableFixedPathStart.fromArray(path[index]);
    reusableFixedPathEnd.fromArray(path[index + 1]);
    const progress = closestPointOnSegmentProgress(reusableFixedPathPoint, reusableFixedPathStart, reusableFixedPathEnd);
    const distance = distanceToSegment(reusableFixedPathPoint, reusableFixedPathStart, reusableFixedPathEnd, progress);
    const segmentActivation = 1 - smoothstep(radius * 0.28, radius, distance);
    if (segmentActivation > activation) {
      activation = segmentActivation;
      pathProgress = (index + progress) / (path.length - 1);
    }
  }

  return { activation, progress: pathProgress };
}

function nervousHash(seed: number): number {
  return Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
}

function writeNerveTrunk(
  linePositions: MutableNumberArray,
  pointPositions: ArrayLike<number>,
  pointCount: number,
  start: Vector3,
  target: Vector3,
  elapsed: number,
  lineCount: number,
): number {
  let previousFound = false;
  const nearestStride = Math.max(1, Math.floor(pointCount / 9000));

  for (let segment = 0; segment <= NERVOUS_TRUNK_SEGMENTS && lineCount < SURFACE_LINE_LIMIT; segment += 1) {
    const t = segment / NERVOUS_TRUNK_SEGMENTS;
    reusableNerveWaypoint.lerpVectors(start, target, t);
    const found = findClosestSurfacePoint(pointPositions, pointCount, nearestStride, reusableNerveWaypoint, reusableNerveCurrent);
    if (!found) continue;

    if (previousFound && reusableNervePrevious.distanceTo(reusableNerveCurrent) <= SURFACE_LINE_MAX_DISTANCE) {
      const pulse = Math.sin(elapsed * 12.0 + segment * 0.8) * 0.006;
      const writeIndex = lineCount * 6;
      linePositions[writeIndex] = reusableNervePrevious.x;
      linePositions[writeIndex + 1] = reusableNervePrevious.y + pulse;
      linePositions[writeIndex + 2] = reusableNervePrevious.z;
      linePositions[writeIndex + 3] = reusableNerveCurrent.x;
      linePositions[writeIndex + 4] = reusableNerveCurrent.y - pulse;
      linePositions[writeIndex + 5] = reusableNerveCurrent.z;
      lineCount += 1;
    }

    reusableNervePrevious.copy(reusableNerveCurrent);
    previousFound = true;
  }

  return lineCount;
}

function findClosestSurfacePoint(
  pointPositions: ArrayLike<number>,
  pointCount: number,
  stride: number,
  target: Vector3,
  result: Vector3,
): boolean {
  let bestDistanceSq = Infinity;
  let bestIndex = -1;

  for (let index = 0; index < pointCount; index += stride) {
    const x = pointPositions[index * 3];
    const y = pointPositions[index * 3 + 1];
    const z = pointPositions[index * 3 + 2];
    const distanceSq = (x - target.x) ** 2 + (y - target.y) ** 2 + (z - target.z) ** 2;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestIndex = index;
    }
  }

  if (bestIndex === -1) return false;
  result.set(pointPositions[bestIndex * 3], pointPositions[bestIndex * 3 + 1], pointPositions[bestIndex * 3 + 2]);
  return true;
}

function setNerveTarget(target: Vector3, start: Vector3, region: BodyRegion | null, minY: number, maxY: number): void {
  const height = Math.max(0.001, maxY - minY);
  const shoulderY = minY + height * 0.63;
  const hipY = minY + height * 0.43;
  const neckY = minY + height * 0.76;

  if (region === "rightShoulder" || region === "rightArm" || region === "rightHand") {
    target.set(0.34, shoulderY, start.z * 0.55);
  } else if (region === "leftShoulder" || region === "leftArm" || region === "leftHand") {
    target.set(-0.34, shoulderY, start.z * 0.55);
  } else if (region === "rightLeg" || region === "rightFoot") {
    target.set(0.18, hipY, start.z * 0.55);
  } else if (region === "leftLeg" || region === "leftFoot") {
    target.set(-0.18, hipY, start.z * 0.55);
  } else if (region === "head") {
    target.set(0, neckY, start.z * 0.45);
  } else if (region === "oxygenTank") {
    target.set(0, shoulderY, start.z * -0.4);
  } else {
    target.set(0, shoulderY, start.z * 0.4);
  }
}

function closestPointOnSegmentProgress(point: Vector3, start: Vector3, end: Vector3): number {
  reusableNerveSegment.subVectors(end, start);
  const lengthSq = reusableNerveSegment.lengthSq();
  if (lengthSq <= 0.000001) return 0;
  reusableNerveOffset.subVectors(point, start);
  return Math.max(0, Math.min(1, reusableNerveOffset.dot(reusableNerveSegment) / lengthSq));
}

function distanceToSegment(point: Vector3, start: Vector3, end: Vector3, progress: number): number {
  reusableNerveClosest.lerpVectors(start, end, progress);
  return point.distanceTo(reusableNerveClosest);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

function collectSurfaceSources(root: Object3D): Mesh[] {
  const sources: Mesh[] = [];

  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    sources.push(mesh);
  });

  return sources;
}

function bakeSurfaceSource(scene: Object3D, mesh: Mesh): { bakedMesh: Mesh; bakedGeometry: BufferGeometry; weight: number } {
  const bakedGeometry = mesh.geometry.clone();
  const sourcePosition = mesh.geometry.getAttribute("position");
  const bakedPositions = new Float32Array(sourcePosition.count * 3);
  const skinnedMesh = isSkinnedMesh(mesh) ? mesh : null;

  skinnedMesh?.skeleton.update();

  for (let index = 0; index < sourcePosition.count; index += 1) {
    reusableSamplePoint.fromBufferAttribute(sourcePosition, index);
    if (skinnedMesh) {
      skinnedMesh.applyBoneTransform(index, reusableSamplePoint);
    }
    mesh.localToWorld(reusableSamplePoint);
    scene.worldToLocal(reusableSamplePoint);
    bakedPositions[index * 3] = reusableSamplePoint.x;
    bakedPositions[index * 3 + 1] = reusableSamplePoint.y;
    bakedPositions[index * 3 + 2] = reusableSamplePoint.z;
  }

  bakedGeometry.setAttribute("position", new Float32BufferAttribute(bakedPositions, 3));
  bakedGeometry.deleteAttribute("skinIndex");
  bakedGeometry.deleteAttribute("skinWeight");
  bakedGeometry.computeVertexNormals();
  bakedGeometry.computeBoundingBox();

  const size = new Vector3();
  bakedGeometry.boundingBox?.getSize(size);
  return {
    bakedGeometry,
    bakedMesh: new Mesh(bakedGeometry),
    weight: Math.max(0.001, size.x * size.y + size.y * size.z + size.x * size.z),
  };
}

function isSkinnedMesh(mesh: Mesh): mesh is SkinnedMesh {
  return (mesh as SkinnedMesh).isSkinnedMesh === true;
}

function ignorePointRaycast(): void {}

function surfaceGlowOpacityForFrame(stable: boolean, stableProgress: number, hoveredPoint: Vector3Tuple | null, stablePoint: Vector3Tuple | null): number {
  const surfaceFade = stable ? 1 - smoothstep(0.08, 0.82, stableProgress) : 1;
  const hasSurfaceInteraction = Boolean(hoveredPoint || stablePoint);
  return (hasSurfaceInteraction ? 0.34 : 0.05) * surfaceFade;
}

function surfacePointOpacityForFrame(stable: boolean, stableProgress: number, hoveredPoint: Vector3Tuple | null, stablePoint: Vector3Tuple | null): number {
  const surfaceFade = stable ? 1 - smoothstep(0.08, 0.82, stableProgress) : 1;
  const hasSurfaceInteraction = Boolean(hoveredPoint || stablePoint);
  return (hasSurfaceInteraction ? 0.34 : 0.68) * surfaceFade;
}

function prepareMaskedPointMaterial({
  size,
  opacity,
  blending = NormalBlending,
}: {
  size: number;
  opacity: number;
  blending?: typeof AdditiveBlending | typeof NormalBlending;
}): MaskedPointMaterial {
  const material = new PointsMaterial({
    size,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity,
    blending,
    depthTest: true,
    depthWrite: false,
  }) as MaskedPointMaterial;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHasHiddenPoint = { value: 0 };
    shader.uniforms.uHiddenPoint = { value: new Vector3() };
    shader.uniforms.uHiddenRadius = { value: HOVER_COLOR_RADIUS * 0.92 };
    material.userData.hoverMaskUniforms = shader.uniforms;

    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        `
uniform float uHasHiddenPoint;
uniform vec3 uHiddenPoint;
uniform float uHiddenRadius;
varying float vPointCloudVisibility;

void main() {`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
  float hiddenInfluence = uHasHiddenPoint * (1.0 - smoothstep(uHiddenRadius * 0.55, uHiddenRadius, distance(transformed, uHiddenPoint)));
  vPointCloudVisibility = 1.0 - hiddenInfluence;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `
varying float vPointCloudVisibility;

void main() {`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
if (vPointCloudVisibility <= 0.02) discard;`,
      )
      .replace(
        "#include <opaque_fragment>",
        `diffuseColor.a *= smoothstep(0.0, 1.0, vPointCloudVisibility);
#include <opaque_fragment>`,
      );
  };

  material.needsUpdate = true;
  return material;
}

function updateMaskedPointMaterial(material: MaskedPointMaterial, interactionPoint: Vector3Tuple | null, scene: Object3D, opacity: number): void {
  material.opacity = opacity;

  const uniforms = material.userData.hoverMaskUniforms;
  if (!uniforms) return;

  uniforms.uHasHiddenPoint.value = interactionPoint ? 1 : 0;
  if (interactionPoint) {
    reusableSurfaceInteraction.fromArray(interactionPoint);
    scene.worldToLocal(reusableSurfaceInteraction);
    uniforms.uHiddenPoint.value = reusableSurfaceInteraction;
  }
}

function prepareMaterial(source: Material, opacity: number): WaveMaterial {
  const material = source.clone() as WaveMaterial;
  material.transparent = true;
  material.opacity = opacity;
  material.depthWrite = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uHoveredRegion = { value: -1 };
    shader.uniforms.uHasHoverPoint = { value: 0 };
    shader.uniforms.uHoverPoint = { value: new Vector3() };
    shader.uniforms.uHoverRadius = { value: 0.92 };
    shader.uniforms.uHasStablePoint = { value: 0 };
    shader.uniforms.uStablePoint = { value: new Vector3() };
    shader.uniforms.uStableProgress = { value: 0 };
    shader.uniforms.uWaveStrength = { value: 1 };
    shader.uniforms.uBaseOpacity = { value: opacity };
    material.userData.entangledUniforms = shader.uniforms;

    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        `
uniform float uTime;
uniform float uHoveredRegion;
uniform float uHasHoverPoint;
uniform vec3 uHoverPoint;
uniform float uHoverRadius;
uniform float uHasStablePoint;
uniform vec3 uStablePoint;
uniform float uStableProgress;
uniform float uWaveStrength;
varying float vEntangledHover;
varying float vStableReveal;

float entangledMask(vec3 p) {
  if (uHasHoverPoint < 0.5) return 0.0;
  float distanceToCursor = distance(p, uHoverPoint);
  return 1.0 - smoothstep(uHoverRadius * 0.45, uHoverRadius, distanceToCursor);
}

void main() {`,
      )
      .replace(
        "#include <skinning_vertex>",
        `#include <skinning_vertex>
  vEntangledHover = entangledMask(transformed);
  float stableRadius = mix(0.0, 18.0, smoothstep(0.0, 1.0, uStableProgress));
  float stableDistance = distance(transformed, uStablePoint);
  vStableReveal = uHasStablePoint * (1.0 - smoothstep(stableRadius * 0.52, stableRadius, stableDistance));
  float ring = sin((distance(transformed, uHoverPoint) * 18.0) - (uTime * 7.0));
  float fullBodyWave = sin(uTime * 3.2 + transformed.y * 2.4 + transformed.x * 1.5 + transformed.z * 1.2);
  float hoverStability = 1.0 - vEntangledHover;
  float entangledWave = fullBodyWave * 0.12 * uWaveStrength * hoverStability * (1.0 - vStableReveal) + ring * 0.004 * uWaveStrength * vEntangledHover;
  transformed += normalize(transformedNormal) * entangledWave;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `
uniform float uBaseOpacity;
varying float vEntangledHover;
varying float vStableReveal;

void main() {`,
      )
      .replace(
        "#include <opaque_fragment>",
        `float hoverOpacity = mix(uBaseOpacity, 0.86, vEntangledHover);
float revealOpacity = mix(hoverOpacity, 1.0, vStableReveal);
diffuseColor.a = clamp(revealOpacity, 0.08, 1.0);
#include <opaque_fragment>`,
      );
  };
  material.needsUpdate = true;
  return material;
}

const reusableHoverPoint = new Vector3();
const reusableStablePoint = new Vector3();
const reusableFixedInteraction = new Vector3();
const reusableFixedWorldPoint = new Vector3();
const reusableFixedPathPoint = new Vector3();
const reusableFixedPathStart = new Vector3();
const reusableFixedPathEnd = new Vector3();
const reusableSamplePoint = new Vector3();
const reusableSurfaceHover = new Vector3();
const reusableSurfaceInteraction = new Vector3();
const reusableNerveTarget = new Vector3();
const reusablePointOnNervePath = new Vector3();
const reusableCandidateOnNervePath = new Vector3();
const reusableNerveSegment = new Vector3();
const reusableNerveOffset = new Vector3();
const reusableNerveClosest = new Vector3();
const reusableNerveWaypoint = new Vector3();
const reusableNervePrevious = new Vector3();
const reusableNerveCurrent = new Vector3();

function regionToId(region: BodyRegion | null): number {
  if (region === "head") return 0;
  if (region === "chest") return 1;
  if (region === "torso") return 2;
  if (region === "oxygenTank") return 3;
  if (region === "rightShoulder") return 4;
  if (region === "leftShoulder") return 5;
  if (region === "rightArm") return 6;
  if (region === "leftArm") return 7;
  if (region === "rightHand") return 8;
  if (region === "leftHand") return 9;
  if (region === "rightLeg") return 10;
  if (region === "leftLeg") return 11;
  if (region === "rightFoot") return 12;
  if (region === "leftFoot") return 13;
  return -1;
}
