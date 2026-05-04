import { type Vector3Tuple } from "three";

import { isBodyRegion, type TileState } from "./bodyRegions";

type PackedTileCloud = {
  version: number;
  tileCount: number;
  regions: string[];
  targetPositions: number[];
  scatteredPositions: number[];
  regionIndices: number[];
};

export async function loadPrecomputedTiles(url: string): Promise<TileState[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load precomputed tile cloud: ${response.status}`);
  }

  const packed = (await response.json()) as PackedTileCloud;
  if (packed.version !== 1) {
    throw new Error(`Unsupported tile cloud version: ${packed.version}`);
  }

  const tiles: TileState[] = [];

  for (let index = 0; index < packed.tileCount; index += 1) {
    const targetPosition = readTuple(packed.targetPositions, index);
    const scatteredPosition = readTuple(packed.scatteredPositions, index);
    const region = packed.regions[packed.regionIndices[index]];

    if (!isBodyRegion(region)) {
      throw new Error(`Invalid tile region at index ${index}: ${region}`);
    }

    tiles.push({
      currentPosition: lerpTuple(scatteredPosition, targetPosition, 0.88),
      targetPosition,
      scatteredPosition,
      region,
      activation: 0,
      coherence: 0.18,
      displacement: 0,
      collapseProgress: 0,
    });
  }

  return tiles;
}

function readTuple(values: number[], index: number): Vector3Tuple {
  const offset = index * 3;
  return [values[offset], -values[offset + 2], -values[offset + 1]];
}

function lerpTuple(from: Vector3Tuple, to: Vector3Tuple, alpha: number): Vector3Tuple {
  return [
    from[0] + (to[0] - from[0]) * alpha,
    from[1] + (to[1] - from[1]) * alpha,
    from[2] + (to[2] - from[2]) * alpha,
  ];
}
