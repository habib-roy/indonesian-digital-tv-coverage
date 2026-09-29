/** Single global state (Svelte 5 runes) + orchestration of the 5-step analysis. */
import { distanceM, type LatLon } from "./core/geo.ts";
import { analysePath } from "./core/fresnel.ts";
import { landCoverAt } from "./core/landcover.ts";
import { advise, type Advice } from "./core/advisor.ts";
import type { ServiceArea, Transmitter } from "./core/data.ts";
import type { Analysis, Heatmap, Req, Res } from "./coverage.worker.ts";
import areasJson from "../../data/service-areas.json";
import txJson from "../../data/transmitters.json";
import { ANALYSIS, HEATMAP, UI, type Theme } from "../config.ts";

export const areas = areasJson as ServiceArea[];
export const transmitters = txJson as Transmitter[];
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- static lookup
export const areaById = new Map(areas.map((a) => [a.id, a]));

export const STEPS = [
  "Lokasi rumah",
  `Cari pemancar ≤${ANALYSIS.maxDistanceM / 1000} km`,
  "Unduh data terrain & tutupan lahan",
  "Hitung jalur sinyal & halangan",
  "Susun rekomendasi",
];
export type StepState = "idle" | "active" | "done" | "error";

const worker = new Worker(new URL("./coverage.worker.ts", import.meta.url), { type: "module" });
type NoId<R> = R extends unknown ? Omit<R, "id"> : never;
let seq = 0;
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- internal RPC table
const handlers = new Map<number, (r: Res) => void>();
worker.onmessage = (e: MessageEvent<Res>) => handlers.get(e.data.id)?.(e.data);

function call<T>(req: NoId<Req>, onProgress?: (done: number, total: number, step: string) => void): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    handlers.set(id, (r) => {
      if (r.type === "progress") return onProgress?.(r.done, r.total, r.step);
      handlers.delete(id);
      if (r.type === "error") reject(new Error(r.message));
      else resolve(r.result as T);
    });
    worker.postMessage({ ...req, id });
  });
}

const lowBandwidth = (() => {
  const c = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
  return !!c && (c.saveData === true || /2g|3g/.test(c.effectiveType ?? ""));
})();

export const app = $state({
  home: null as LatLon | null,
  homeLabel: "",
  height: ANALYSIS.defaultHeightM as number,
  steps: STEPS.map(() => "idle" as StepState),
  progress: "",
  error: "",
  failedStep: -1,
  landcover: 0,
  analysis: null as Analysis | null,
  selected: 0,
  heatmap: null as Heatmap | null,
  heatmapBusy: false,
  heatmapOn: false,
  terrain3d: true,
  hover: null as number | null, // profile index highlighted from the chart
  lowBandwidth,
  theme: (document.documentElement.dataset.theme === "dark" ? "dark" : "light") as Theme,
});

export function toggleTheme() {
  app.theme = app.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = app.theme;
  localStorage.setItem("theme", app.theme);
}

/** Set home from the browser's high-accuracy GPS and analyse. Resolves to an error message, or "" on success. */
export function locateHome(): Promise<string> {
  if (!("geolocation" in navigator)) return Promise.resolve("Browser tidak mendukung lokasi. Cari alamat atau ketuk peta.");
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        app.home = { lat: p.coords.latitude, lon: p.coords.longitude };
        app.homeLabel = `Lokasi saya (±${Math.round(p.coords.accuracy)} m)`;
        void analyse();
        resolve("");
      },
      (err) =>
        resolve(
          err.code === 1
            ? "Izin lokasi ditolak. Cari alamat atau ketuk peta."
            : "Lokasi tidak didapat. Cari alamat atau ketuk peta.",
        ),
      { enableHighAccuracy: true, timeout: UI.geolocationTimeoutMs, maximumAge: 0 },
    ),
  );
}

export const current = () => app.analysis?.results[app.selected];
export const currentResult = () => current()?.byHeight[app.height - 1];

export function geometry() {
  const c = current();
  return c && analysePath(c.pfl, c.tx.height_m, app.height, c.tx.freq_mhz);
}

export function advice(): Advice | undefined {
  const c = current();
  const r = currentResult();
  if (!c || !r || !app.home) return;
  const g = geometry()!;
  const ob = g.obstructions.reduce<(typeof g.obstructions)[number] | undefined>(
    (m, o) => (!m || o.loss > m.loss ? o : m),
    undefined,
  );
  return advise({
    home: app.home,
    f__mhz: c.tx.freq_mhz,
    margin_dB: r.margin_dB,
    heightNow: app.height,
    minHeight: c.minHeight,
    obstruction: ob && { km: (c.distanceM - ob.d) / 1000, height: ob.height, bearing: c.bearing },
  });
}

const setStep = (i: number, s: StepState) => (app.steps[i] = s);

/** Run steps from `from` (for per-step retry). */
export async function analyse(from = 0) {
  if (!app.home) return;
  const home = $state.snapshot(app.home);
  app.error = "";
  app.failedStep = -1;
  for (let i = from; i < STEPS.length; i++) setStep(i, "idle");
  if (from === 0) app.analysis = null;
  let step = from;
  try {
    setStep((step = 0), "active");
    setStep(0, "done");

    setStep((step = 1), "active");
    const near = transmitters
      .filter((t) => distanceM(t, home) <= ANALYSIS.maxDistanceM)
      .sort((a, b) => distanceM(a, home) - distanceM(b, home))
      .slice(0, ANALYSIS.maxTransmitters);
    if (!near.length) throw new Error("Tidak ada pemancar terdata dalam 150 km. Kemungkinan perlu parabola satelit.");
    app.progress = `${near.length} pemancar`;
    setStep(1, "done");

    setStep((step = 2), "active");
    app.progress = "tutupan lahan…";
    app.landcover = await landCoverAt(home).catch(() => 50); // fallback: assume built-up (conservative)
    const result = await call<Analysis>(
      { type: "analyse", home, txs: $state.snapshot(near), landcover: app.landcover },
      (d, t, s) => {
        if (s === "terrain") app.progress = `tile ${d}/${t}`;
        else {
          if (app.steps[2] === "active") setStep(2, "done");
          setStep((step = 3), "active");
          app.progress = `pemancar ${d + 1}/${t}`;
        }
      },
    );
    setStep(2, "done");
    setStep((step = 3), "done");

    setStep((step = 4), "active");
    app.analysis = result;
    app.selected = 0;
    setStep(4, "done");
    app.progress = "";
    if (app.heatmapOn) void refreshHeatmap();
  } catch (e) {
    setStep(step, "error");
    app.failedStep = step;
    app.error = e instanceof Error ? e.message : String(e);
  }
}

let heatBbox: [number, number, number, number] | null = null;
let heatTimer: ReturnType<typeof setTimeout> | undefined;
export const setHeatmapBbox = (b: [number, number, number, number]) => {
  heatBbox = b;
  scheduleHeatmap();
};
export function scheduleHeatmap() {
  clearTimeout(heatTimer);
  heatTimer = setTimeout(() => void refreshHeatmap(), HEATMAP.debounceMs);
}

async function refreshHeatmap() {
  if (!app.heatmapOn || !heatBbox) return;
  const [w, s, e, n] = heatBbox;
  const c = { lat: (s + n) / 2, lon: (w + e) / 2 };
  const txs = transmitters.filter((t) => distanceM(t, c) <= ANALYSIS.maxDistanceM + distanceM({ lat: s, lon: w }, c));
  if (!txs.length) return;
  app.heatmapBusy = true;
  try {
    const grid = matchMedia(`(min-width: ${UI.desktopMinWidth}px)`).matches ? HEATMAP.gridDesktop : HEATMAP.gridMobile;
    app.heatmap = await call<Heatmap>({
      type: "heatmap",
      bbox: heatBbox,
      txs: txs.slice(0, HEATMAP.maxTransmitters),
      rxHeight: app.height,
      grid,
    });
  } catch {
    /* heatmap is best-effort */
  } finally {
    app.heatmapBusy = false;
  }
}
