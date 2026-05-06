"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdditiveBlending,
  BackSide,
  Box3,
  CanvasTexture,
  Color,
  Mesh,
  Object3D,
  Texture,
  Vector3,
} from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Lensflare, LensflareElement } from "three/examples/jsm/objects/Lensflare.js";

const GROUND_Y = -1.48;
const NASA_MOON_URL = "/models/moon.glb";
const EARTH_TEXTURE_URL = "/textures/nasa-earth-blue-marble.jpg";
const MOON_DIAMETER = 18;
const MOON_ROTATION: [number, number, number] = [0, -0.35, 0];

type LoadedMoon = {
  scene: Object3D;
  position: [number, number, number];
  scale: number;
};

type SunTextures = {
  corona: Texture;
  core: Texture;
  flare: Texture;
};

type EarthTextures = {
  disc: Texture;
  glow: Texture;
};

export function SpaceEnvironment() {
  const [moon, setMoon] = useState<LoadedMoon | null>(null);
  const [sunTextures, setSunTextures] = useState<SunTextures | null>(null);
  const [earthTextures, setEarthTextures] = useState<EarthTextures | null>(null);
  const sunLensflare = useMemo(() => (sunTextures ? createSunLensflare(sunTextures) : null), [sunTextures]);

  const starPositions = useMemo(() => {
    const starCount = 9000;
    const positions = new Float32Array(starCount * 3);

    for (let index = 0; index < starCount; index += 1) {
      const radius = 54 + Math.random() * 72;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(-1 + Math.random() * 2);

      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.cos(phi);
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }

    return positions;
  }, []);

  const brightStarPositions = useMemo(() => {
    const starCount = 420;
    const positions = new Float32Array(starCount * 3);

    for (let index = 0; index < starCount; index += 1) {
      const radius = 62 + Math.random() * 58;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(-1 + Math.random() * 2);

      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.cos(phi);
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }

    return positions;
  }, []);

  const milkyWay = useMemo(() => {
    const count = 5200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new Color();

    for (let index = 0; index < count; index += 1) {
      const radius = 58 + Math.random() * 14;
      const along = (Math.random() - 0.5) * 2.8;
      const band = (Math.random() - 0.5) * 0.34;
      const x = Math.sin(along) * radius;
      const y = 8 + band * radius + Math.sin(along * 1.7) * 5;
      const z = -Math.cos(along) * radius;
      const tiltX = x * 0.92 - y * 0.22;
      const tiltY = x * 0.1 + y * 0.96;

      positions[index * 3] = tiltX;
      positions[index * 3 + 1] = tiltY;
      positions[index * 3 + 2] = z;

      color.set(Math.random() > 0.6 ? "#d8e6ff" : "#fff2d4");
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    return { positions, colors };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    loader.loadAsync(NASA_MOON_URL).then((gltf) => {
      if (cancelled) return;

      const scene = gltf.scene;
      scene.traverse((object) => {
        object.frustumCulled = false;
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        mesh.receiveShadow = true;
        mesh.castShadow = false;
      });

      scene.updateMatrixWorld(true);
      const box = new Box3().setFromObject(scene);
      const center = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3());
      const scale = MOON_DIAMETER / Math.max(size.x, size.y, size.z, 0.001);

      setMoon({
        scene,
        scale,
        position: [-center.x * scale, GROUND_Y - box.max.y * scale, -center.z * scale],
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const textures = createSunTextures();
    setSunTextures(textures);

    return () => {
      textures.corona.dispose();
      textures.core.dispose();
      textures.flare.dispose();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    createEarthTextures(EARTH_TEXTURE_URL).then((textures) => {
      if (cancelled) {
        textures.disc.dispose();
        textures.glow.dispose();
        return;
      }
      setEarthTextures(textures);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      earthTextures?.disc.dispose();
      earthTextures?.glow.dispose();
    };
  }, [earthTextures]);

  return (
    <group>
      <mesh>
        <sphereGeometry args={[140, 96, 96]} />
        <meshBasicMaterial color="#03050a" side={BackSide} toneMapped={false} />
      </mesh>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#dfeaff"
          size={0.024}
          sizeAttenuation
          transparent
          opacity={0.88}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </points>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[brightStarPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffffff"
          size={0.06}
          sizeAttenuation
          transparent
          opacity={0.95}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </points>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[milkyWay.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[milkyWay.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.055}
          sizeAttenuation
          transparent
          opacity={0.34}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {earthTextures ? (
        <group position={[18, 3.8, -40]}>
          <sprite scale={[5.8, 5.8, 1]}>
            <spriteMaterial map={earthTextures.glow} color="#78c9ff" transparent opacity={0.65} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
          </sprite>
          <sprite scale={[4.7, 4.7, 1]}>
            <spriteMaterial map={earthTextures.disc} transparent depthWrite={false} toneMapped={false} />
          </sprite>
        </group>
      ) : null}

      <group position={[-22, 17, -58]}>
        <pointLight color="#fff5cf" intensity={115} distance={360} decay={0.5}>
          {sunLensflare ? <primitive object={sunLensflare} /> : null}
        </pointLight>
        {sunTextures ? (
          <>
            <sprite scale={[20, 20, 1]}>
              <spriteMaterial
                map={sunTextures.corona}
                color="#fff1ba"
                transparent
                opacity={1}
                blending={AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </sprite>
            <sprite scale={[3.4, 3.4, 1]}>
              <spriteMaterial
                map={sunTextures.core}
                color="#fffdf4"
                transparent
                opacity={1}
                blending={AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </sprite>
          </>
        ) : null}
      </group>

      {moon ? (
        <group position={moon.position} scale={moon.scale} rotation={MOON_ROTATION}>
          <primitive object={moon.scene} />
        </group>
      ) : null}
    </group>
  );
}

function createSunTextures(): SunTextures {
  return {
    corona: createSunCoronaTexture(),
    core: createSunCoreTexture(),
    flare: createSunFlareTexture(),
  };
}

function createEarthTextures(url: string): Promise<EarthTextures> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        disc: createMaskedEarthTexture(image),
        glow: createEarthGlowTexture(),
      });
    };
    image.onerror = () => reject(new Error(`Failed to load Earth texture: ${url}`));
    image.src = url;
  });
}

function createMaskedEarthTexture(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);

  const size = canvas.width;
  context.drawImage(image, 0, 0, size, size);
  const imageData = context.getImageData(0, 0, size, size);
  const data = imageData.data;
  const center = size / 2;
  const radius = size * 0.46;
  const feather = size * 0.045;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const distance = Math.hypot(x - center, y - center);
      const circleAlpha = 1 - smoothstep(radius, radius + feather, distance);
      const brightness = (data[offset] + data[offset + 1] + data[offset + 2]) / 765;
      const blackAlpha = smoothstep(0.025, 0.12, brightness);
      data[offset + 3] = Math.round(255 * circleAlpha * blackAlpha);
    }
  }

  context.putImageData(imageData, 0, 0);
  return finalizeCanvasTexture(canvas);
}

function createEarthGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);

  const center = 256;
  const gradient = context.createRadialGradient(center, center, 120, center, center, 250);
  gradient.addColorStop(0, "rgba(90, 190, 255, 0.16)");
  gradient.addColorStop(0.5, "rgba(60, 155, 255, 0.11)");
  gradient.addColorStop(1, "rgba(60, 155, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  return finalizeCanvasTexture(canvas);
}

function createSunLensflare(textures: SunTextures) {
  const flare = new Lensflare();
  flare.addElement(new LensflareElement(textures.flare, 760, 0, new Color("#fff7d6")));
  flare.addElement(new LensflareElement(textures.flare, 160, 0.38, new Color("#ffd06a")));
  flare.addElement(new LensflareElement(textures.flare, 92, 0.63, new Color("#ff8f45")));
  flare.addElement(new LensflareElement(textures.flare, 52, 0.86, new Color("#fff0a0")));
  return flare;
}

function createSunCoronaTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);

  const center = 512;
  const gradient = context.createRadialGradient(center, center, 20, center, center, 500);
  gradient.addColorStop(0, "rgba(255, 255, 245, 1)");
  gradient.addColorStop(0.08, "rgba(255, 238, 150, 0.95)");
  gradient.addColorStop(0.18, "rgba(255, 184, 58, 0.65)");
  gradient.addColorStop(0.42, "rgba(255, 115, 32, 0.24)");
  gradient.addColorStop(0.72, "rgba(255, 76, 18, 0.075)");
  gradient.addColorStop(1, "rgba(255, 76, 18, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.translate(center, center);
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < 96; index += 1) {
    const angle = (index / 96) * Math.PI * 2;
    const length = 220 + Math.sin(index * 2.17) * 90 + Math.random() * 190;
    const width = 2 + Math.random() * 5;
    const start = 58 + Math.random() * 36;
    const alpha = 0.025 + Math.random() * 0.08;

    context.rotate(angle);
    const ray = context.createLinearGradient(start, 0, length, 0);
    ray.addColorStop(0, `rgba(255, 246, 178, ${alpha * 1.6})`);
    ray.addColorStop(0.35, `rgba(255, 171, 52, ${alpha})`);
    ray.addColorStop(1, "rgba(255, 120, 28, 0)");
    context.fillStyle = ray;
    context.fillRect(start, -width / 2, length, width);
    context.rotate(-angle);
  }
  context.restore();

  return finalizeCanvasTexture(canvas);
}

function createSunCoreTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);

  const center = 256;
  const gradient = context.createRadialGradient(center, center, 0, center, center, 250);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.28, "rgba(255, 253, 224, 1)");
  gradient.addColorStop(0.5, "rgba(255, 221, 105, 0.96)");
  gradient.addColorStop(0.72, "rgba(255, 154, 35, 0.42)");
  gradient.addColorStop(1, "rgba(255, 120, 22, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < 38; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 30 + Math.random() * 92;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    const spot = context.createRadialGradient(x, y, 0, x, y, 42 + Math.random() * 34);
    spot.addColorStop(0, "rgba(255,255,255,0.55)");
    spot.addColorStop(1, "rgba(255,190,60,0)");
    context.fillStyle = spot;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  return finalizeCanvasTexture(canvas);
}

function createSunFlareTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);

  const center = 256;
  const gradient = context.createRadialGradient(center, center, 0, center, center, 250);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.12, "rgba(255,250,210,0.92)");
  gradient.addColorStop(0.28, "rgba(255,210,90,0.55)");
  gradient.addColorStop(0.56, "rgba(255,132,36,0.16)");
  gradient.addColorStop(1, "rgba(255,120,20,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalCompositeOperation = "lighter";
  context.fillStyle = "rgba(255,255,235,0.35)";
  context.fillRect(0, center - 1.5, canvas.width, 3);
  context.fillRect(center - 1.5, 0, 3, canvas.height);

  return finalizeCanvasTexture(canvas);
}

function finalizeCanvasTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
