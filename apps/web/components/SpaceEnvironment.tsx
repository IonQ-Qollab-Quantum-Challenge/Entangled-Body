"use client";

import { useLoader } from "@react-three/fiber";
import { BackSide, TextureLoader } from "three";

const SPACE_TEXTURE_URL = "/textures/space-lunar-background.png";

export function SpaceEnvironment() {
  const texture = useLoader(TextureLoader, SPACE_TEXTURE_URL);

  return (
    <group>
      <mesh position={[0, 0.35, -5.8]}>
        <planeGeometry args={[12.8, 7.2]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>

      <mesh position={[0, -1.48, 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.8, 96]} />
        <meshStandardMaterial color="#8b877d" roughness={0.96} metalness={0} />
      </mesh>

      <mesh position={[0, -1.49, 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 5.9, 128]} />
        <meshStandardMaterial color="#57544f" roughness={1} side={BackSide} />
      </mesh>
    </group>
  );
}
