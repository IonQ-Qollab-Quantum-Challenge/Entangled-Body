import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Box3, Mesh, Object3D, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const DEFAULT_MODEL_PATH = "apps/web/public/models/astronaut_rigged_and_animated.glb";
const DEFAULT_OUTPUT_PATH = "apps/web/public/data/astronaut-tile-cloud-18000.json";
const DEFAULT_TILE_COUNT = 18000;
const BODY_REGIONS = ["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"];

globalThis.self ??= globalThis;

const modelPath = resolve(repoRoot, process.argv[2] ?? DEFAULT_MODEL_PATH);
const outputPath = resolve(repoRoot, process.argv[3] ?? DEFAULT_OUTPUT_PATH);
const tileCount = Number.parseInt(process.argv[4] ?? `${DEFAULT_TILE_COUNT}`, 10);

if (!Number.isFinite(tileCount) || tileCount <= 0) {
  throw new Error(`Invalid tile count: ${process.argv[4]}`);
}

const modelBuffer = await readFile(modelPath);
const loader = new GLTFLoader();
const gltf = await loader.parseAsync(modelBuffer.buffer.slice(modelBuffer.byteOffset, modelBuffer.byteOffset + modelBuffer.byteLength), dirname(modelPath));
const tiles = sampleSceneToTiles(gltf.scene, tileCount);
const packed = packTiles(tiles);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(packed)}\n`);

console.log(`Wrote ${tiles.length} tiles to ${outputPath}`);

function sampleSceneToTiles(scene, count) {
  scene.updateMatrixWorld(true);

  const box = new Box3().setFromObject(scene);
  const minY = box.min.y;
  const maxY = box.max.y;
  const sources = collectMeshes(scene);
  const totalWeight = sources.reduce((sum, source) => sum + source.weight, 0) || 1;

  const tiles = [];
  const target = new Vector3();
  const normal = new Vector3();

  for (const source of sources) {
    const sourceCount = Math.max(1, Math.round((source.weight / totalWeight) * count));
    const sampler = new MeshSurfaceSampler(source.mesh).build();

    for (let index = 0; index < sourceCount && tiles.length < count; index += 1) {
      sampler.sample(target, normal);
      source.mesh.localToWorld(target);
      normal.transformDirection(source.mesh.matrixWorld);

      const region = source.region ?? regionFromSpatialPosition(target.x, target.y, minY, maxY);
      const scattered = target.clone().add(
        normal
          .clone()
          .multiplyScalar(0.18 + Math.random() * 0.42)
          .add(new Vector3((Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.18)),
      );

      tiles.push({
        targetPosition: target.toArray(),
        scatteredPosition: scattered.toArray(),
        region,
      });
    }
  }

  normalizeTiles(tiles);
  return tiles;
}

function collectMeshes(root) {
  const sources = [];

  root.traverse((object) => {
    const mesh = object;
    if (!(mesh instanceof Mesh) || !mesh.geometry) return;
    mesh.geometry.computeBoundingBox();
    const size = new Vector3();
    mesh.geometry.boundingBox?.getSize(size);
    const region = normalizeRegionName(mesh.name || mesh.parent?.name || "");
    sources.push({
      mesh,
      region,
      weight: Math.max(0.001, size.x * size.y + size.y * size.z + size.x * size.z),
    });
  });

  return sources;
}

function normalizeTiles(tiles) {
  if (tiles.length === 0) return;

  const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

  for (const tile of tiles) {
    const target = new Vector3().fromArray(tile.targetPosition);
    min.min(target);
    max.max(target);
  }

  const center = min.clone().add(max).multiplyScalar(0.5);
  const size = max.clone().sub(min);
  const scale = 3.6 / Math.max(size.x, size.y, size.z, 0.001);

  for (const tile of tiles) {
    tile.targetPosition = normalizeTuple(tile.targetPosition, center, scale);
    tile.scatteredPosition = normalizeTuple(tile.scatteredPosition, center, scale);
  }
}

function normalizeTuple(tuple, center, scale) {
  return new Vector3().fromArray(tuple).sub(center).multiplyScalar(scale).toArray();
}

function packTiles(tiles) {
  return {
    version: 1,
    tileCount: tiles.length,
    regions: BODY_REGIONS,
    targetPositions: tiles.flatMap((tile) => tile.targetPosition.map(roundPosition)),
    scatteredPositions: tiles.flatMap((tile) => tile.scatteredPosition.map(roundPosition)),
    regionIndices: tiles.map((tile) => BODY_REGIONS.indexOf(tile.region)),
  };
}

function roundPosition(value) {
  return Math.round(value * 100000) / 100000;
}

function normalizeRegionName(name) {
  const normalized = name.toLowerCase();
  if (normalized.includes("head") || normalized.includes("helmet")) return "head";
  if (normalized.includes("torso") || normalized.includes("spine") || normalized.includes("chest")) return "torso";
  if (normalized.includes("left") && (normalized.includes("arm") || normalized.includes("hand"))) return "leftArm";
  if (normalized.includes("right") && (normalized.includes("arm") || normalized.includes("hand"))) return "rightArm";
  if (normalized.includes("left") && (normalized.includes("leg") || normalized.includes("foot"))) return "leftLeg";
  if (normalized.includes("right") && (normalized.includes("leg") || normalized.includes("foot"))) return "rightLeg";
  return null;
}

function regionFromSpatialPosition(x, y, minY, maxY) {
  const height = Math.max(0.001, maxY - minY);
  const normalizedY = (y - minY) / height;

  if (normalizedY > 0.78) return "head";
  if (normalizedY > 0.47) {
    if (x < -0.38) return "leftArm";
    if (x > 0.38) return "rightArm";
    return "torso";
  }

  return x < 0 ? "leftLeg" : "rightLeg";
}
