/// <reference lib="webworker" />
/** All heavy work off the main thread: terrain, ITM, heatmap. */
import { Terrain, fetchTerrariumTile } from "./core/terrain.ts";
import { link, type LinkResult } from "./core/propagation.ts";
import { clutterCategory, type ClutterCategory } from "./core/clutter.ts";
import { bearingDeg, distanceM, type LatLon } from "./core/geo.ts";
import type { Transmitter } from "./core/data.ts";
import { ANALYSIS, HEATMAP } from "../config.ts";

export type Req =
  | { id: number; type: "analyse"; home: LatLon; txs: Transmitter[]; landcover: number }
  | { id: number; type: "heatmap"; bbox: [number, number, number, number]; txs: Transmitter[]; rxHeight: number; grid: number };

export interface TxAnalysis {
  tx: Transmitter;
  distanceM: number;
  bearing: number;
  pfl: number[];
  /** index h-1 → result for antenna height h (1..ANALYSIS.maxHeightM m) */
  byHeight: LinkResult[];
  minHeight: number | null;
}

export interface Analysis {
  clutter: ClutterCategory;
  results: TxAnalysis[];
}

export interface Heatmap {
  bbox: [number, number, number, number]; // west, south, east, north
  grid: number;
  margins: Float32Array; // row-major, north row first; NaN = not computed
}

export type Res =
  | { id: number; type: "progress"; step: "terrain" | "itm"; done: number; total: number }
  | { id: number; type: "analyse"; result: Analysis }
  | { id: number; type: "heatmap"; result: Heatmap }
  | { id: number; type: "error"; message: string };

// Two caches: fine terrain for the house paths, coarse terrain for the heatmap grid (see config.ts).
const terrain = new Terrain(fetchTerrariumTile, ANALYSIS.terrainZoom, ANALYSIS.terrainCacheTiles);
const heatTerrain = new Terrain(fetchTerrariumTile, HEATMAP.terrainZoom, HEATMAP.terrainCacheTiles);
const post = (m: Res, t?: Transferable[]) => (self as DedicatedWorkerGlobalScope).postMessage(m, t ?? []);

async function analyse(r: Extract<Req, { type: "analyse" }>): Promise<Analysis> {
  const paths = r.txs.map((tx) => Terrain.pathPoints(tx, r.home));
  await terrain.prefetch(paths.flat(), (done, total) => post({ id: r.id, type: "progress", step: "terrain", done, total }));
  const clutter = clutterCategory(r.landcover);
  const results: TxAnalysis[] = [];
  r.txs.forEach((tx, i) => {
    post({ id: r.id, type: "progress", step: "itm", done: i, total: r.txs.length });
    const pfl = terrain.profile(paths[i]);
    const base = { pfl, txHeight: tx.height_m, erp_kw: tx.erp_kw, f__mhz: tx.freq_mhz, clutter };
    try {
      const byHeight = Array.from({ length: ANALYSIS.maxHeightM }, (_, h) => link({ ...base, rxHeight: h + 1 }));
      const mh = byHeight.findIndex((x) => x.margin_dB >= 0);
      results.push({
        tx,
        distanceM: distanceM(tx, r.home),
        bearing: bearingDeg(r.home, tx),
        pfl,
        byHeight,
        minHeight: mh < 0 ? null : mh + 1,
      });
    } catch {
      // ITM rejects out-of-range paths (e.g. < ~1 km); skip that transmitter.
    }
  });
  results.sort((a, b) => b.byHeight[9].margin_dB - a.byHeight[9].margin_dB);
  return { clutter, results };
}

/**
 * Coverage grid: one ITM path per cell per candidate transmitter, keep the best margin.
 * ponytail: nominal "suburban" clutter everywhere — per-cell WorldCover would be grid² COG reads.
 * Upgrade by sampling a low-res WorldCover overview for the bbox.
 */
async function heatmap(r: Extract<Req, { type: "heatmap" }>): Promise<Heatmap> {
  const { grid, bbox, txs } = r;
  const [w, s, e, n] = bbox;
  const centers: LatLon[] = [];
  for (let row = 0; row < grid; row++)
    for (let col = 0; col < grid; col++)
      centers.push({ lat: n - ((row + 0.5) / grid) * (n - s), lon: w + ((col + 0.5) / grid) * (e - w) });
  // Nearest ≤3 transmitters per cell; path points built one at a time (memory).
  const jobs = centers.flatMap((c, i) =>
    txs
      .map((tx) => ({ i, tx, c, d: distanceM(tx, c) }))
      .filter((j) => j.d <= ANALYSIS.maxDistanceM && j.d > ANALYSIS.minDistanceM)
      .sort((a, b) => a.d - b.d)
      .slice(0, HEATMAP.perCellTransmitters),
  );
  if (!jobs.length) return { bbox, grid, margins: new Float32Array(grid * grid).fill(NaN) };
  // Prefetch every z9 tile (~0.7°) in the box spanning cells + transmitters via a 0.1° probe grid.
  const all: LatLon[] = [...centers, ...jobs.map((j) => j.tx)];
  const lats = all.map((p) => p.lat);
  const lons = all.map((p) => p.lon);
  const probe: LatLon[] = [];
  for (let la = Math.min(...lats); la <= Math.max(...lats) + 0.1; la += 0.1)
    for (let lo = Math.min(...lons); lo <= Math.max(...lons) + 0.1; lo += 0.1) probe.push({ lat: la, lon: lo });
  await heatTerrain.prefetch(probe, (done, total) => post({ id: r.id, type: "progress", step: "terrain", done, total }));
  const margins = new Float32Array(grid * grid).fill(NaN);
  jobs.forEach((j, k) => {
    try {
      const m = link({
        pfl: heatTerrain.profile(Terrain.pathPoints(j.tx, j.c, HEATMAP.pathStepM)),
        txHeight: j.tx.height_m,
        rxHeight: r.rxHeight,
        erp_kw: j.tx.erp_kw,
        f__mhz: j.tx.freq_mhz,
        clutter: "suburban",
      }).margin_dB;
      if (!(margins[j.i] >= m)) margins[j.i] = m;
    } catch {
      /* degenerate path: leave cell as-is */
    }
    if (k % 200 === 0) post({ id: r.id, type: "progress", step: "itm", done: k, total: jobs.length });
  });
  return { bbox, grid, margins };
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const r = ev.data;
  try {
    if (r.type === "analyse") post({ id: r.id, type: "analyse", result: await analyse(r) });
    else {
      const result = await heatmap(r);
      post({ id: r.id, type: "heatmap", result }, [result.margins.buffer]);
    }
  } catch (err) {
    post({ id: r.id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
