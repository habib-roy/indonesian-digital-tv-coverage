/**
 * Terrain elevation from Terrarium-encoded PNG tiles (AWS Open Data "elevation-tiles-prod").
 * Pure logic + injectable tile loader so it runs in a Worker and in Node tests.
 */
import { interpolate, distanceM, type LatLon } from "./geo.ts";

import { TERRARIUM_URL } from "../../config.ts";

export const TILE_SIZE = 256;

/** Terrarium: height = R*256 + G + B/256 − 32768 (meters). */
export const decodeTerrarium = (r: number, g: number, b: number): number => r * 256 + g + b / 256 - 32768;

/** RGBA pixels → Float32 heights. */
export function decodeTile(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = decodeTerrarium(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  return out;
}

/** Fractional Web-Mercator tile coordinates. */
export function tileCoord(p: LatLon, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const φ = (p.lat * Math.PI) / 180;
  return {
    x: ((p.lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2) * n,
  };
}

export type TileLoader = (z: number, x: number, y: number) => Promise<Float32Array>;

/** Browser/worker loader: fetch PNG → decode with OffscreenCanvas. */
export const fetchTerrariumTile: TileLoader = async (z, x, y) => {
  const url = TERRARIUM_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Terrain tile ${z}/${x}/${y}: HTTP ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const cv = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("OffscreenCanvas 2D not available");
  ctx.drawImage(bmp, 0, 0);
  return decodeTile(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data);
};

export class Terrain {
  readonly zoom: number;
  private loader: TileLoader;
  private maxTiles: number;
  private tiles = new Map<string, Float32Array>(); // insertion order = LRU
  private pending = new Map<string, Promise<void>>();

  constructor(loader: TileLoader, zoom = 12, maxTiles = 400) {
    this.loader = loader;
    this.zoom = zoom;
    this.maxTiles = maxTiles;
  }

  /** Tiles needed for the given points (same 2×2 pixels as bilinear sampling). */
  tilesFor(points: LatLon[]): string[] {
    const s = new Set<string>();
    for (const p of points) {
      const { x, y } = tileCoord(p, this.zoom);
      const x0 = Math.floor(x * TILE_SIZE - 0.5);
      const y0 = Math.floor(y * TILE_SIZE - 0.5);
      for (const gx of [x0, x0 + 1])
        for (const gy of [y0, y0 + 1]) s.add(`${Math.floor(gx / TILE_SIZE)}/${Math.floor(gy / TILE_SIZE)}`);
    }
    return [...s];
  }

  private load(key: string): Promise<void> {
    if (this.tiles.has(key)) return Promise.resolve();
    let p = this.pending.get(key);
    if (!p) {
      const [x, y] = key.split("/").map(Number);
      p = this.loader(this.zoom, x, y)
        .then((t) => {
          this.tiles.set(key, t);
          if (this.tiles.size > this.maxTiles) this.tiles.delete(this.tiles.keys().next().value as string);
        })
        .finally(() => this.pending.delete(key));
      this.pending.set(key, p);
    }
    return p;
  }

  /** Load all tiles for points; reports (done, total). Must be called before sampling. */
  async prefetch(points: LatLon[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const keys = this.tilesFor(points);
    let done = 0;
    await Promise.all(keys.map((k) => this.load(k).then(() => onProgress?.(++done, keys.length))));
  }

  private px(gx: number, gy: number): number {
    const tx = Math.floor(gx / TILE_SIZE);
    const ty = Math.floor(gy / TILE_SIZE);
    const key = `${tx}/${ty}`;
    const t = this.tiles.get(key);
    if (!t) throw new Error(`terrain tile ${key} not prefetched`);
    return t[(gy - ty * TILE_SIZE) * TILE_SIZE + (gx - tx * TILE_SIZE)];
  }

  /** Bilinear elevation (m) from prefetched tiles. Sea (negative bathymetry) clamps to 0. */
  elevation(p: LatLon): number {
    const { x, y } = tileCoord(p, this.zoom);
    const px = x * TILE_SIZE - 0.5;
    const py = y * TILE_SIZE - 0.5;
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const fx = px - x0;
    const fy = py - y0;
    const h =
      this.px(x0, y0) * (1 - fx) * (1 - fy) +
      this.px(x0 + 1, y0) * fx * (1 - fy) +
      this.px(x0, y0 + 1) * (1 - fx) * fy +
      this.px(x0 + 1, y0 + 1) * fx * fy;
    return Math.max(0, h);
  }

  /** Great-circle sample points a→b, ~`spacingM` apart (10..1500 intervals). */
  static pathPoints(a: LatLon, b: LatLon, spacingM = 90): LatLon[] {
    const n = Math.max(10, Math.min(1500, Math.ceil(distanceM(a, b) / spacingM)));
    return Array.from({ length: n + 1 }, (_, i) => interpolate(a, b, i / n));
  }

  /** ITM pfl [intervals, spacing_m, h0..hn] from prefetched tiles. */
  profile(points: LatLon[]): number[] {
    const n = points.length - 1;
    return [n, distanceM(points[0], points[n]) / n, ...points.map((p) => this.elevation(p))];
  }
}
