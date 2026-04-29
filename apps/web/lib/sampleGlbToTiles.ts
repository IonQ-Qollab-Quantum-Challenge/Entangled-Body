import { Box3, Mesh, Object3D, Vector3, type Vector3Tuple } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";

import { normalizeRegionName, regionFromSpatialPosition, type BodyRegion, type TileState } from "./bodyRegions";

type MeshSampleSource = {
  mesh: Mesh;
  region: BodyRegion | null;
  weight: number;
};

const DEFAULT_TILE_COUNT = 18000;

export async function sampleGlbToTiles(url: string, tileCount = DEFAULT_TILE_COUNT): Promise<TileState[]> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  const box = new Box3().setFromObject(scene);
  const minY = box.min.y;
  const maxY = box.max.y;
  const sources = collectMeshes(scene);
  const totalWeight = sources.reduce((sum, source) => sum + source.weight, 0) || 1;

  const tiles: TileState[] = [];
  const target = new Vector3();
  const normal = new Vector3();

  for (const source of sources) {
    const count = Math.max(1, Math.round((source.weight / totalWeight) * tileCount));
    const sampler = new MeshSurfaceSampler(source.mesh).build();

    for (let index = 0; index < count && tiles.length < tileCount; index += 1) {
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
      const initial = scattered.clone().lerp(target, 0.88);

      tiles.push({
        currentPosition: initial.toArray() as Vector3Tuple,
        targetPosition: target.toArray() as Vector3Tuple,
        scatteredPosition: scattered.toArray() as Vector3Tuple,
        region,
        activation: 0,
        coherence: 0.18,
        displacement: 0,
        collapseProgress: 0,
      });
    }
  }

  normalizeTiles(tiles);
  return tiles;
}

function collectMeshes(root: Object3D): MeshSampleSource[] {
  const sources: MeshSampleSource[] = [];

  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
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

function normalizeTiles(tiles: TileState[]): void {
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
    tile.currentPosition = new Vector3()
      .fromArray(tile.scatteredPosition)
      .lerp(new Vector3().fromArray(tile.targetPosition), 0.88)
      .toArray() as Vector3Tuple;
  }
}

function normalizeTuple(tuple: Vector3Tuple, center: Vector3, scale: number): Vector3Tuple {
  return new Vector3().fromArray(tuple).sub(center).multiplyScalar(scale).toArray() as Vector3Tuple;
}
