"use client";

import { useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import { BackSide, RepeatWrapping, TextureLoader } from "three";

const SPACE_TEXTURE_URL = "/textures/space-lunar-background.png";
const GROUND_Y = -1.48;

export function SpaceEnvironment() {
  const texture = useLoader(TextureLoader, SPACE_TEXTURE_URL);
  const groundTexture = useMemo(() => texture.clone(), [texture]);

  // texture.wrapS = RepeatWrapping;
  // texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 1);

  groundTexture.wrapS = RepeatWrapping;
  groundTexture.wrapT = RepeatWrapping;
  groundTexture.repeat.set(2.4, 0.34);
  groundTexture.offset.set(0.04, 0.02);
  groundTexture.needsUpdate = true;

  return (
    <group>
      <mesh rotation={[0, Math.PI * 0.18, 0]}>
        <sphereGeometry args={[60, 64, 64]} />
        <meshBasicMaterial map={texture} side={BackSide} toneMapped={false} />
      </mesh>

      <mesh position={[0, GROUND_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[18, 160]} />
        <meshStandardMaterial map={groundTexture} color="#b9b3a7" roughness={0.98} metalness={0} />
      </mesh>

      <mesh position={[-1.55, GROUND_Y + 0.006, -0.8]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.24, 0.82, 96]} />
        <meshStandardMaterial color="#66625b" roughness={1} />
      </mesh>

      <mesh position={[1.7, GROUND_Y + 0.007, -1.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.56, 96]} />
        <meshStandardMaterial color="#5f5b55" roughness={1} />
      </mesh>

      <mesh position={[0.75, GROUND_Y + 0.008, 1.35]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.12, 0.38, 72]} />
        <meshStandardMaterial color="#706c64" roughness={1} />
      </mesh>

      <mesh position={[-3.1, GROUND_Y + 0.004, 1.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 80]} />
        <meshStandardMaterial color="#77736b" roughness={1} />
      </mesh>
    </group>
  );
}
