/**
 * App-wide settings: external services, analysis limits, map & UI tuning.
 *
 * Change values here, not in components. This file is plain TypeScript with no DOM access,
 * so it is safe to import from the Web Worker and from Node tests.
 *
 * Physical/model constants (ITM parameters, receiver threshold, clutter heights) live next to
 * the model code in `src/lib/core/` because they are documented with their sources there.
 */

/** Project repository (links in the "Kontribusi" modal). */
export const REPO_URL = "https://github.com/habib-roy/indonesian-digital-tv-coverage";

/** Google Analytics 4 measurement ID; only loaded on GA_HOST (see main.ts). */
export const GA_ID = "G-8NR467SH2G";
export const GA_HOST = "tv-digital.hanatek.id";

// ─── External services (all free, no API key) ────────────────────────────────────────────────

/** Terrarium-encoded elevation PNG tiles (AWS Open Data "elevation-tiles-prod"). */
export const TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

/** ESA WorldCover 2021 v200 COGs on Microsoft Planetary Computer (the AWS copy has no CORS). */
export const WORLDCOVER = {
  blobUrl: "https://ai4edataeuwest.blob.core.windows.net/esa-worldcover/v200/2021/map",
  tokenUrl: "https://planetarycomputer.microsoft.com/api/sas/v1/token/esa-worldcover",
} as const;

/**
 * Nominatim geocoder. Usage policy: max 1 request/second, no autocomplete, cache results.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
export const NOMINATIM = {
  url: "https://nominatim.openstreetmap.org/search",
  params: { format: "json", limit: "5", countrycodes: "id", "accept-language": "id" },
  minIntervalMs: 1000,
} as const;

/** Glyphs for raster basemaps (vector styles bring their own). */
export const GLYPHS_URL = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

export type Theme = "light" | "dark";
export type BasemapDef =
  | { label: string; kind: "style"; url: (theme: Theme) => string }
  | { label: string; kind: "raster"; tiles: string; attribution: string; maxzoom: number };

/** Basemaps shown in the layer control. Keys are stable IDs; order = order in the menu. */
export const BASEMAPS = {
  auto: {
    label: "Peta",
    kind: "style",
    url: (t: Theme) => `https://tiles.openfreemap.org/styles/${t === "dark" ? "dark" : "positron"}`,
  },
  streets: { label: "Jalan", kind: "style", url: () => "https://tiles.openfreemap.org/styles/liberty" },
  satellite: {
    label: "Satelit",
    kind: "raster",
    tiles: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics", // required by Esri terms
    maxzoom: 19,
  },
  topo: {
    label: "Topografi",
    kind: "raster",
    tiles: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "© OpenTopoMap (CC-BY-SA) · © OpenStreetMap",
    maxzoom: 17,
  },
} as const satisfies Record<string, BasemapDef>;
export type BasemapId = keyof typeof BASEMAPS;

// ─── Analysis ────────────────────────────────────────────────────────────────────────────────

export const ANALYSIS = {
  /** Transmitters farther than this are ignored (UHF beyond ~150 km is rarely usable). */
  maxDistanceM: 150_000,
  /** ITM is not valid for very short paths. */
  minDistanceM: 1_000,
  /** How many nearest transmitters are analysed for the house. */
  maxTransmitters: 8,
  /** Antenna height slider range (m above ground), step 1 m. */
  minHeightM: 1,
  maxHeightM: 30,
  defaultHeightM: 10,
  /** Terrain zoom for the house analysis: z11 ≈ 60 m/px, matches the 30–90 m source DEM. */
  terrainZoom: 11,
  /** Max decoded tiles kept in memory (256×256 Float32 ≈ 256 KB each). */
  terrainCacheTiles: 300,
} as const;

export const HEATMAP = {
  /** Cells per side. Desktop gets a finer grid. */
  gridMobile: 40,
  gridDesktop: 80,
  /** Transmitters considered for the visible area / per cell. */
  maxTransmitters: 6,
  perCellTransmitters: 3,
  /** Coarse terrain for the grid: z9 ≈ 250 m/px, matches the path sample spacing below. */
  terrainZoom: 9,
  terrainCacheTiles: 200,
  pathStepM: 300,
  /** Heatmap is only computed and shown from this map zoom (smaller = too many cells/km). */
  minZoom: 9,
  /** Debounce after pan/zoom/slider before recomputing. */
  debounceMs: 300,
} as const;

// ─── Map & UI ────────────────────────────────────────────────────────────────────────────────

export const MAP = {
  /** Initial view: all of Indonesia (Sabang–Merauke, Miangas–Rote), fitted to the screen. [W, S, E, N] */
  bounds: [95, -11, 141, 6] as [number, number, number, number],
  defaultBasemap: "satellite" as BasemapId,
  /** Terrain vertical exaggeration — visual only, analysis always uses true heights. */
  terrainExaggeration: 2,
  /** Zoom when flying to a searched/located address. */
  flyToZoom: 12,
  /** Camera after analysis: frame house + transmitter, then tilt. */
  resultPitch: 60,
  resultMaxZoom: 14,
  /** Extra zoom over the flat "fit both points" zoom (perspective shrinks the far side). */
  resultZoomBoost3d: 0.4,
  resultZoomBoost2d: 0.3,
} as const;

export const UI = {
  /** Desktop layout breakpoint (px); must match `@media (min-width: 900px)` in CSS. */
  desktopMinWidth: 900,
  /** Desktop sidebar width (px); must match `.sheet` width in BottomSheet.svelte. */
  sidebarWidth: 420,
  /** Mobile bottom-sheet snap points, % of viewport height visible. */
  sheetSnaps: [18, 55, 92] as const,
  /** Search error/info message auto-hides after this. */
  messageTimeoutMs: 5000,
  geolocationTimeoutMs: 15_000,
} as const;
