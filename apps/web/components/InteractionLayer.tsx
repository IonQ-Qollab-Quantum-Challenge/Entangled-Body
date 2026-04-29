"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useRef } from "react";
import type { Vector3Tuple } from "three";

import type { BodyRegion } from "../lib/bodyRegions";

type InteractionLayerProps = {
  onHoverRegion: (region: BodyRegion | null, point?: Vector3Tuple) => void;
  onMeasureRegion: (region: BodyRegion, point?: Vector3Tuple) => void;
  onGlobalCollapse: () => void;
};

type RegionVolume = {
  region: BodyRegion;
  position: [number, number, number];
  scale: [number, number, number];
};

const VOLUMES: RegionVolume[] = [
  { region: "head", position: [0, 1.28, 0], scale: [0.72, 0.62, 0.58] },
  { region: "torso", position: [0, 0.43, 0], scale: [1.12, 1.12, 0.62] },
  { region: "leftArm", position: [-0.88, 0.37, 0], scale: [0.48, 1.2, 0.5] },
  { region: "rightArm", position: [0.88, 0.37, 0], scale: [0.48, 1.2, 0.5] },
  { region: "leftLeg", position: [-0.33, -1.0, 0], scale: [0.48, 1.36, 0.5] },
  { region: "rightLeg", position: [0.33, -1.0, 0], scale: [0.48, 1.36, 0.5] },
];

export function InteractionLayer({ onHoverRegion, onMeasureRegion, onGlobalCollapse }: InteractionLayerProps) {
  const holdTimer = useRef<number | null>(null);

  function clearHoldTimer() {
    if (holdTimer.current === null) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    clearHoldTimer();
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      onGlobalCollapse();
    }, 650);
  }

  function handlePointerUp(event: ThreeEvent<PointerEvent>, region: BodyRegion) {
    event.stopPropagation();
    if (holdTimer.current !== null) {
      clearHoldTimer();
      onMeasureRegion(region);
    }
  }

  return (
    <group>
      {VOLUMES.map((volume) => (
        <mesh
          key={volume.region}
          position={volume.position}
          scale={volume.scale}
          onPointerMove={(event) => {
            event.stopPropagation();
            onHoverRegion(volume.region, event.point.toArray());
          }}
          onPointerDown={handlePointerDown}
          onPointerUp={(event) => handlePointerUp(event, volume.region)}
          onPointerLeave={() => {
            clearHoldTimer();
            onHoverRegion(null);
          }}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
