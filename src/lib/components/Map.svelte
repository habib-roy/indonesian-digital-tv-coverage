<!--
  MapLibre map: basemaps, 3D terrain, transmitters, house pin, signal path, obstacles, heatmap, layer/theme controls.
  Reads/writes global state in state.svelte.ts; all tunables come from src/config.ts.
-->
<script lang="ts">
  import * as maplibregl from "maplibre-gl";
  import type { GeoJSONSource, ImageSource } from "maplibre-gl";
  // maplibre v6 resolves its worker relative to its own module URL, which breaks after bundling.
  import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
  import { onMount } from "svelte";
  import {
    app,
    toggleTheme,
    transmitters,
    current,
    geometry,
    analyse,
    setHeatmapBbox,
    scheduleHeatmap,
  } from "../state.svelte.ts";
  import { interpolate } from "../core/geo.ts";
  import {
    BASEMAPS,
    GLYPHS_URL,
    HEATMAP,
    MAP,
    TERRARIUM_URL,
    UI,
    type BasemapDef,
    type BasemapId,
    type Theme,
  } from "../../config.ts";

  let el: HTMLDivElement;
  let map: maplibregl.Map | undefined = $state();
  let overlayVersion = $state(0); // bumps after (re)adding overlay layers on each style load
  let homeMarker: maplibregl.Marker | undefined;
  let hoverMarker: maplibregl.Marker | undefined;
  const heatCanvas = document.createElement("canvas");

  /** Build a MapLibre style for a basemap from config.ts. */
  function styleFor(id: BasemapId, theme: Theme): string | maplibregl.StyleSpecification {
    const b: BasemapDef = BASEMAPS[id];
    if (b.kind === "style") return b.url(theme);
    return {
      version: 8,
      glyphs: GLYPHS_URL,
      sources: { base: { type: "raster", tiles: [b.tiles], tileSize: 256, maxzoom: b.maxzoom, attribution: b.attribution } },
      layers: [{ id: "base", type: "raster", source: "base" }],
    };
  }
  let basemap: BasemapId = $state(MAP.defaultBasemap);
  let layersOpen = $state(false);
  let ctrls: HTMLDivElement;
  maplibregl.setWorkerUrl(workerUrl);

  /** margin (dB) → RGBA: red < 0, amber 0–10, green ≥ 10 */
  function color(m: number): [number, number, number, number] {
    if (Number.isNaN(m)) return [0, 0, 0, 0];
    if (m < -10) return [230, 60, 75, 110];
    if (m < 0) return [240, 110, 70, 150];
    if (m < 10) return [245, 180, 60, 150];
    return [60, 210, 130, 150];
  }

  export function flyTo(lat: number, lon: number) {
    map?.flyTo({ center: [lon, lat], zoom: MAP.flyToZoom, pitch: 0, bearing: 0, duration: 1600 });
  }

  /** PNG of the current view; redraw() renders synchronously so the WebGL buffer is still valid. */
  export function snapshot(): string {
    if (!map) return "";
    map.redraw();
    return map.getCanvas().toDataURL("image/png");
  }

  function setHome(lat: number, lon: number) {
    app.home = { lat, lon };
    app.homeLabel = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    void analyse();
  }

  onMount(() => {
    map = new maplibregl.Map({
      container: el,
      style: styleFor(basemap, app.theme),
      center: MAP.center,
      zoom: MAP.zoom,
      maxPitch: 80,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    // Our layer/theme buttons join MapLibre's own control stack (same look, no overlap math).
    map.getContainer().querySelector(".maplibregl-ctrl-top-right")?.append(ctrls);

    let first = true;
    map.on("style.load", () => {
      const m = map!;
      m.addSource("dem", {
        type: "raster-dem",
        tiles: [TERRARIUM_URL],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 14,
        attribution: "Terrain: Mapzen/AWS Terrain Tiles",
      });
      m.addLayer({
        id: "hillshade",
        type: "hillshade",
        source: "dem",
        paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#000" },
      });
      if (app.terrain3d) m.setTerrain({ source: "dem", exaggeration: MAP.terrainExaggeration });

      m.addSource("tx", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: transmitters.map((t) => ({
            type: "Feature",
            properties: { name: t.name, est: t.confidence.location !== "osm" },
            geometry: { type: "Point", coordinates: [t.lon, t.lat] },
          })),
        },
      });
      m.addLayer({
        id: "tx",
        type: "circle",
        source: "tx",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3, 12, 8],
          "circle-color": ["case", ["get", "est"], "#f5b43c", "#22d3b5"],
          "circle-stroke-color": "#0b1218",
          "circle-stroke-width": 2,
        },
      });
      m.addLayer({
        id: "tx-label",
        type: "symbol",
        source: "tx",
        minzoom: HEATMAP.minZoom,
        layout: { "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top" },
        paint: {
          "text-color": app.theme === "dark" ? "#cfe" : "#123",
          "text-halo-color": app.theme === "dark" ? "#000" : "#fff",
          "text-halo-width": 1.2,
        },
      });

      m.addSource("path", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "path-glow",
        type: "line",
        source: "path",
        paint: { "line-color": ["get", "color"], "line-width": 10, "line-opacity": 0.25, "line-blur": 6 },
      });
      m.addLayer({
        id: "path",
        type: "line",
        source: "path",
        paint: { "line-color": ["get", "color"], "line-width": 3, "line-dasharray": [2, 1] },
      });
      m.addSource("obst", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "obst",
        type: "circle",
        source: "obst",
        paint: { "circle-radius": 7, "circle-color": "#ef5160", "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
      });

      const reportBbox = () => {
        if (m.getZoom() < HEATMAP.minZoom) return;
        const b = m.getBounds();
        setHeatmapBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      };
      if (first) m.on("moveend", reportBbox);
      first = false;
      reportBbox();
      overlayVersion++;
    });

    map.on("click", (e) => {
      if (map!.queryRenderedFeatures(e.point, { layers: ["tx"] }).length) return;
      setHome(e.lngLat.lat, e.lngLat.lng);
    });
    map.on("click", "tx", (e) => {
      const f = e.features?.[0];
      if (f) new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat).setText(String(f.properties.name)).addTo(map!);
    });

    return () => map?.remove();
  });

  // Home marker
  $effect(() => {
    if (!map || !app.home) return;
    const { lat, lon } = app.home;
    if (!homeMarker) {
      const dot = document.createElement("div");
      dot.className = "home-pin";
      dot.setAttribute("aria-label", "Lokasi rumah (geser untuk memindah)");
      homeMarker = new maplibregl.Marker({ element: dot, draggable: true }).setLngLat([lon, lat]).addTo(map);
      homeMarker.on("dragend", () => {
        const p = homeMarker!.getLngLat();
        setHome(p.lat, p.lng);
      });
    } else homeMarker.setLngLat([lon, lat]);
  });

  // After analysis / transmitter change: frame house + selected transmitter, looking from house toward tx.
  let flownFor = "";
  $effect(() => {
    const c = current();
    const home = app.home;
    if (!map || !c || !home) return;
    const key = `${home.lat},${home.lon},${c.tx.id}`;
    if (flownFor === key) return;
    flownFor = key;
    const desktop = innerWidth >= UI.desktopMinWidth;
    // Keep both points clear of the results panel (right sidebar on desktop, bottom sheet on mobile).
    const padding = desktop
      ? { top: 80, bottom: 80, left: 80, right: UI.sidebarWidth + 80 }
      : { top: 70, bottom: Math.round((innerHeight * UI.sheetSnaps[1]) / 100) + 30, left: 50, right: 70 };
    const cam = map.cameraForBounds(
      new maplibregl.LngLatBounds([home.lon, home.lat], [home.lon, home.lat]).extend([c.tx.lon, c.tx.lat]),
      { padding, bearing: c.bearing, maxZoom: MAP.resultMaxZoom },
    );
    if (!cam?.center || cam.zoom === undefined) return;
    // Zoom a bit past the flat fit: perspective shrinks the far side, so both points usually stay visible.
    const pitch = app.terrain3d ? MAP.resultPitch : 0;
    map.easeTo({
      center: cam.center,
      zoom: cam.zoom + (pitch ? MAP.resultZoomBoost3d : MAP.resultZoomBoost2d),
      bearing: c.bearing,
      pitch,
      duration: 2200,
    });
  });

  // 3D toggle
  let last3d = app.terrain3d;
  $effect(() => {
    const on = app.terrain3d;
    if (!map || !overlayVersion) return;
    map.setTerrain(on ? { source: "dem", exaggeration: MAP.terrainExaggeration } : null);
    if (on !== last3d) map.easeTo({ pitch: on ? 60 : 0, duration: 800 });
    last3d = on;
  });

  // Signal path + obstructions
  $effect(() => {
    const c = current();
    const g = geometry();
    const m = map;
    if (!m || !overlayVersion || !app.home) return;
    const path = m.getSource("path") as GeoJSONSource | undefined;
    const obst = m.getSource("obst") as GeoJSONSource | undefined;
    if (!c || !g) {
      path?.setData({ type: "FeatureCollection", features: [] });
      obst?.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const margin = c.byHeight[app.height - 1].margin_dB;
    const col = margin >= 10 ? "#3cd282" : margin >= 0 ? "#f5b43c" : "#ef5160";
    path?.setData({
      type: "Feature",
      properties: { color: col },
      geometry: {
        type: "LineString",
        coordinates: [
          [c.tx.lon, c.tx.lat],
          [app.home.lon, app.home.lat],
        ],
      },
    });
    const n = c.pfl[0];
    obst?.setData({
      type: "FeatureCollection",
      features: g.obstructions.map((o) => {
        const p = interpolate(c.tx, app.home!, o.index / n);
        return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lon, p.lat] } };
      }),
    });
  });

  // Chart hover → map highlight
  $effect(() => {
    const c = current();
    if (!map || !c || app.hover === null || !app.home) {
      hoverMarker?.remove();
      hoverMarker = undefined;
      return;
    }
    const p = interpolate(c.tx, app.home, app.hover / c.pfl[0]);
    if (!hoverMarker) {
      const d = document.createElement("div");
      d.className = "hover-pin";
      hoverMarker = new maplibregl.Marker({ element: d });
    }
    hoverMarker.setLngLat([p.lon, p.lat]).addTo(map);
  });

  // Heatmap raster
  $effect(() => {
    const h = app.heatmap;
    const m = map;
    if (!m || !overlayVersion) return;
    if (!h || !app.heatmapOn) {
      if (m.getLayer("heat")) m.setLayoutProperty("heat", "visibility", "none");
      return;
    }
    heatCanvas.width = heatCanvas.height = h.grid;
    const ctx = heatCanvas.getContext("2d")!;
    const img = ctx.createImageData(h.grid, h.grid);
    h.margins.forEach((v, i) => img.data.set(color(v), i * 4));
    ctx.putImageData(img, 0, 0);
    const [w, s, e, n] = h.bbox;
    const coords: [[number, number], [number, number], [number, number], [number, number]] = [
      [w, n],
      [e, n],
      [e, s],
      [w, s],
    ];
    const url = heatCanvas.toDataURL();
    const src = m.getSource("heat") as ImageSource | undefined;
    if (src) src.updateImage({ url, coordinates: coords });
    else {
      m.addSource("heat", { type: "image", url, coordinates: coords });
      m.addLayer(
        {
          id: "heat",
          type: "raster",
          source: "heat",
          paint: { "raster-opacity": 0.7, "raster-resampling": "linear", "raster-fade-duration": 300 },
        },
        "tx",
      );
    }
    m.setLayoutProperty("heat", "visibility", "visible");
  });

  // Theme → basemap (overlays re-added on style.load)
  let lastStyle = `${MAP.defaultBasemap}:${app.theme}`; // style the map was created with
  $effect(() => {
    const key = `${basemap}:${app.theme}`;
    if (!map || key === lastStyle) return;
    lastStyle = key;
    map.setStyle(styleFor(basemap, app.theme));
  });

  // Heatmap follows slider
  $effect(() => {
    void app.height;
    if (app.heatmapOn) scheduleHeatmap();
  });
</script>

<div class="ctrls" bind:this={ctrls}>
  <div class="maplibregl-ctrl maplibregl-ctrl-group">
    <button
      id="layers-toggle"
      type="button"
      title="Lapisan peta"
      aria-label="Lapisan peta"
      aria-expanded={layersOpen}
      aria-controls="layers-panel"
      onclick={() => (layersOpen = !layersOpen)}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linejoin="round"
        aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5" /></svg
      >
      {#if app.heatmapBusy}<i class="busy" aria-label="menghitung heatmap"></i>{/if}
    </button>
    <button
      id="toggle-theme"
      type="button"
      title={app.theme === "dark" ? "Mode terang" : "Mode gelap"}
      aria-label={app.theme === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      onclick={toggleTheme}
    >
      {#if app.theme === "dark"}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          aria-hidden="true"
          ><circle cx="12" cy="12" r="4" /><path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          /></svg
        >
      {:else}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linejoin="round"
          aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></svg
        >
      {/if}
    </button>
  </div>
  {#if layersOpen}
    <div id="layers-panel" class="panel glass">
      <fieldset>
        <legend>Peta dasar</legend>
        {#each Object.entries(BASEMAPS) as [id, b] (id)}
          <label><input type="radio" name="basemap" value={id} bind:group={basemap} />{b.label}</label>
        {/each}
      </fieldset>
      <fieldset>
        <legend>Tampilan</legend>
        <label><input id="toggle-3d" type="checkbox" bind:checked={app.terrain3d} />Terrain 3D</label>
        <label><input id="toggle-heatmap" type="checkbox" bind:checked={app.heatmapOn} />Heatmap cakupan</label>
      </fieldset>
    </div>
  {/if}
</div>

<div class="map" bind:this={el} role="application" aria-label="Peta interaktif. Ketuk peta untuk menandai lokasi rumah."></div>

<style>
  .ctrls {
    pointer-events: auto; /* MapLibre's corner container sets pointer-events: none */
    position: relative;
    clear: both;
    float: right;
  }
  .ctrls button {
    position: relative;
    display: grid;
    place-items: center;
    color: #333;
  }
  .busy {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--teal);
    animation: pulse 1s infinite;
  }
  .panel {
    position: absolute;
    right: calc(100% + 8px);
    top: 10px;
    width: 200px;
    padding: 6px;
    border-radius: 12px;
    font-size: 0.85rem;
    animation: fade-up 0.2s var(--ease);
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 4px 0;
    display: grid;
  }
  fieldset + fieldset {
    border-top: 1px solid var(--line);
  }
  legend {
    padding: 4px 10px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
  }
  .panel label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 10px;
    border-radius: 8px;
    cursor: pointer;
  }
  .panel label:has(input:checked) {
    background: var(--teal-soft);
    color: var(--teal);
  }
  .panel input {
    accent-color: var(--teal);
  }
  @keyframes pulse {
    50% {
      opacity: 0.25;
    }
  }
  @media print {
    .ctrls {
      display: none;
    }
  }
  .map {
    position: absolute;
    inset: 0;
  }
  :global(.home-pin) {
    width: 26px;
    height: 26px;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    background: linear-gradient(135deg, var(--amber), hsl(20 95% 58%));
    border: 3px solid #fff;
    box-shadow: 0 0 0 6px hsl(38 95% 58% / 0.25);
    cursor: grab;
  }
  :global(.hover-pin) {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 0 5px hsl(172 72% 48% / 0.5);
  }
</style>
