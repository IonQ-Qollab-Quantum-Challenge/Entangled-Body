"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { Box3, Material, Mesh, Object3D, Vector3, type Vector3Tuple } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { BodyRegion } from "../lib/bodyRegions";
import { regionFromSpatialPosition } from "../lib/bodyRegions";

type OriginalGlbModelProps = {
  modelUrl: string;
  hoveredRegion: BodyRegion | null;
  hoveredPoint: Vector3Tuple | null;
  onHoverRegion: (region: BodyRegion | null, point?: Vector3Tuple) => void;
  onMeasureRegion: (region: BodyRegion, point?: Vector3Tuple) => void;
  onGlobalCollapse: () => void;
  stable: boolean;
  stablePoint: Vector3Tuple | null;
  stableProgress: number;
  opacity?: number;
  waveStrength?: number;
};

type LoadedModel = {
  scene: Object3D;
  position: [number, number, number];
  scale: number;
  bindings: WaveMaterialBinding[];
  minY: number;
  maxY: number;
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

export function OriginalGlbModel({
  modelUrl,
  hoveredRegion,
  hoveredPoint,
  onHoverRegion,
  onMeasureRegion,
  onGlobalCollapse,
  stable,
  stablePoint,
  stableProgress,
  opacity = 0.34,
  waveStrength = 1,
}: OriginalGlbModelProps) {
  const [model, setModel] = useState<LoadedModel | null>(null);
  const holdTimer = useRef<number | null>(null);

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

      setModel({
        scene,
        scale,
        bindings,
        minY: box.min.y,
        maxY: box.max.y,
        position: [-center.x * scale, -center.y * scale, -center.z * scale],
      });
    });

    return () => {
      cancelled = true;
    };
  }, [modelUrl, opacity]);

  useFrame(({ clock }) => {
    if (!model) return;

    const elapsed = clock.getElapsedTime();
    const breath = Math.sin(elapsed * 1.55) * 0.5 + 0.5;
    const revealComplete = stable && stableProgress >= 0.995;
    const effectiveOpacity = revealComplete ? 1 : Math.max(0.07, Math.min(0.42, opacity + breath * 0.028));
    const effectiveWaveStrength = revealComplete ? 0 : waveStrength;
    const hasHoverPoint = !stable && hoveredPoint ? 1 : 0;
    const hasStablePoint = stable && stablePoint ? 1 : 0;

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
      uniforms.uHoverRadius.value = 0.92;
      uniforms.uHasStablePoint.value = hasStablePoint;
      uniforms.uStablePoint.value = localStable;
      uniforms.uStableProgress.value = stableProgress;
      uniforms.uWaveStrength.value = effectiveWaveStrength;
      uniforms.uBaseOpacity.value = material.opacity;
    }
  });

  if (!model) return null;

  function clearHoldTimer() {
    if (holdTimer.current === null) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  function regionFromEvent(event: ThreeEvent<PointerEvent>): { region: BodyRegion; point: Vector3Tuple } | null {
    if (!model) return null;
    const localPoint = event.point.clone();
    model.scene.worldToLocal(localPoint);
    return {
      region: regionFromSpatialPosition(localPoint.x, localPoint.y, model.minY, model.maxY),
      point: event.point.toArray() as Vector3Tuple,
    };
  }

  return (
    <group position={model.position} scale={model.scale}>
      <primitive
        object={model.scene}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          const hit = regionFromEvent(event);
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
          const hit = regionFromEvent(event);
          if (holdTimer.current !== null && hit) {
            clearHoldTimer();
            onMeasureRegion(hit.region, hit.point);
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

function regionToId(region: BodyRegion | null): number {
  if (region === "head") return 0;
  if (region === "torso") return 1;
  if (region === "leftArm") return 2;
  if (region === "rightArm") return 3;
  if (region === "leftLeg") return 4;
  if (region === "rightLeg") return 5;
  return -1;
}
