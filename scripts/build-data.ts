/**
 * Rebuild data/ from public sources. Run: node scripts/build-data.ts
 *
 *  data/service-areas.json  ← id.wikipedia.org "Televisi digital di Indonesia" (CC BY-SA 4.0)
 *  data/transmitters.json   ← ISR TV Digital (SDPPI Komdigi, public Tableau map; location + channel per station),
 *                              fallback OpenStreetMap via Overpass + Nominatim (ODbL 1.0)
 *
 * Kept as two separate databases because CC BY-SA and ODbL share-alike terms are not compatible.
 * Tower height / ERP are not published per site: defaults are marked `estimated` for contributors to fix.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { distanceM } from "../src/lib/core/geo.ts";
import { uhfToMhz, type ServiceArea, type Transmitter } from "../src/lib/core/data.ts";

const UA = { "User-Agent": "tv-digital-data-build/0.1 (https://github.com/habib-roy/indonesian-digital-tv-coverage)" };
const DEFAULT_HEIGHT_M = 100;
const DEFAULT_ERP_KW = 5;
const CACHE = "node_modules/.cache/geocode.json";

async function wikiAreas(): Promise<ServiceArea[]> {
  const url =
    "https://id.wikipedia.org/w/api.php?action=parse&page=Televisi_digital_di_Indonesia&prop=wikitext|revid&format=json&formatversion=2";
  const j = (await (await fetch(url, { headers: UA })).json()) as { parse: { wikitext: string; revid: number } };
  const t = j.parse.wikitext;
  const sec = t.slice(t.indexOf("=== Pembagian wilayah"), t.indexOf("== Proses migrasi"));
  const clean = (s: string) =>
    s
      .replace(/\{\{efn[^}]*\}\}|<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, "")
      .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
      .replace(/^\|/, "")
      .trim();
  const source = `https://id.wikipedia.org/w/index.php?oldid=${j.parse.revid}`;
  const out: ServiceArea[] = [];
  for (const row of sec.split("|-").slice(1)) {
    const c = row
      .split("\n|")
      .map(clean)
      .filter((s) => s && !s.startsWith("}"));
    if (c.length < 3) continue;
    const uhf = [...c[2].matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => n >= 21 && n <= 69);
    if (!uhf.length) continue;
    out.push({ id: slug(c[0]), name: c[0], regencies: c[1], uhf, aso: /^ya/i.test(c[3] ?? ""), source });
  }
  return out;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function geocode(q: string, cache: Record<string, [number, number] | null>) {
  if (q in cache) return cache[q];
  await new Promise((r) => setTimeout(r, 1100)); // Nominatim policy: max 1 req/s
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=id&q=${encodeURIComponent(q)}`;
  const r = (await (await fetch(u, { headers: UA })).json()) as { lat: string; lon: string }[];
  cache[q] = r[0] ? [Number(r[0].lat), Number(r[0].lon)] : null;
  writeFileSync(CACHE, JSON.stringify(cache));
  return cache[q];
}

interface OsmEl {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function osmTowers(): Promise<OsmEl[]> {
  const q = `[out:json][timeout:120];area["ISO3166-1"="ID"]->.a;(
    nwr["communication:television"="yes"](area.a);
    nwr["man_made"~"mast|tower"]["name"~"TV|Pemancar|Transmisi|DVB",i](area.a););out center tags;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: UA,
    body: new URLSearchParams({ data: q }),
  });
  const els = ((await r.json()) as { elements: OsmEl[] }).elements;
  const name = (e: OsmEl) => e.tags?.name ?? "";
  return els.filter(
    (e) =>
      (e.tags?.["communication:television"] === "yes" || /tv|pemancar|transmisi|dvb/i.test(name(e))) &&
      !/bts|telkomsel|smartfren|indosat|\bxl\b|radio|rri|online|hotspot|wifi/i.test(name(e)),
  );
}

const ISR_PAGE = "https://www.postel.go.id/sdppi_maps/27-20210208-peta-sebaran-isr-tv-digital.php";
const ISR_VIZ = "https://public.tableau.com/vizql/w/PetaISRTVDigital_16131981145190/v/DashboardISRTVDigital";

interface IsrRow {
  area: string;
  ch: number;
  lat: number;
  lon: number;
}
interface Bootstrap {
  secondaryInfo: {
    presModelMap: {
      dataDictionary: {
        presModelHolder: {
          genDataDictionaryPresModel: {
            dataSegments: Record<string, { dataColumns: { dataType: string; dataValues: (string | number)[] }[] }>;
          };
        };
      };
      vizData: {
        presModelHolder: {
          genPresModelMapPresModel: {
            presModelMap: Record<
              string,
              {
                presModelHolder: {
                  genVizDataPresModel: {
                    paneColumnsData: {
                      vizDataColumns: {
                        fieldCaption?: string;
                        dataType: string;
                        paneIndices: number[];
                        columnIndices: number[];
                      }[];
                      paneColumnsList: { vizPaneColumns: { valueIndices: number[]; aliasIndices: number[] }[] }[];
                    };
                  };
                };
              }
            >;
          };
        };
      };
    };
  };
}

/**
 * ISR stations behind the SDPPI map. Data download is disabled on the workbook, so this reads the
 * same bootstrap payload the browser receives. Unofficial Tableau endpoint: may break; then fix or skip.
 */
async function isrStations(): Promise<IsrRow[]> {
  const s = await fetch(`${ISR_VIZ}/startSession/viewing?:embed=y&:showVizHome=no`, { method: "POST", headers: UA });
  const sid = s.headers.get("x-session-id");
  const g = s.headers.get("global-session-header");
  if (!sid || !g) throw new Error(`ISR: startSession ${s.status}`);
  const r = await fetch(`${ISR_VIZ}/bootstrapSession/sessions/${sid}`, {
    method: "POST",
    headers: { ...UA, "global-session-header": g },
    body: new URLSearchParams({ sheet_id: "Dashboard ISR TV Digital" }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`ISR: bootstrap ${r.status}`);
  // Body = "<len>;<json><len>;<json>"; the second chunk holds the data.
  const chunks: unknown[] = [];
  for (let i = 0; i < text.length;) {
    const semi = text.indexOf(";", i);
    const n = Number(text.slice(i, semi));
    chunks.push(JSON.parse(text.slice(semi + 1, semi + 1 + n)));
    i = semi + 1 + n;
  }
  const pm = (chunks[1] as Bootstrap).secondaryInfo.presModelMap;
  const dict: Record<string, (string | number)[]> = {};
  for (const seg of Object.values(pm.dataDictionary.presModelHolder.genDataDictionaryPresModel.dataSegments))
    for (const c of seg.dataColumns) (dict[c.dataType] ??= []).push(...c.dataValues);
  const sheet =
    pm.vizData.presModelHolder.genPresModelMapPresModel.presModelMap["TV Digital (2)"].presModelHolder.genVizDataPresModel
      .paneColumnsData;
  const col = (caption: string) => {
    const c = sheet.vizDataColumns.find((c) => c.fieldCaption === caption);
    if (!c) throw new Error(`ISR: field "${caption}" not found`);
    // Numbers come as valueIndices (raw); strings only as aliasIndices.
    const p = sheet.paneColumnsList[c.paneIndices[0]].vizPaneColumns[c.columnIndices[0]];
    const idx = p.valueIndices.length ? p.valueIndices : p.aliasIndices;
    return idx.map((i) => dict[c.dataType][i]);
  };
  const [area, ch, lat, lon] = ["ATTR(Wilayah Layanan)", "ATTR(Kanal)", "Sid Lat", "Sid Long"].map(col);
  return area
    .map((a, i) => ({ area: String(a), ch: Number(ch[i]), lat: Number(lat[i]), lon: Number(lon[i]) }))
    .filter((x) => x.ch >= 21 && x.ch <= 69 && Number.isFinite(x.lat) && Number.isFinite(x.lon));
}

async function main() {
  const areas = await wikiAreas();
  console.log(`service areas: ${areas.length}`);
  const cache: Record<string, [number, number] | null> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const centers = new Map<string, [number, number]>();
  for (const a of areas) {
    const city =
      a.name
        .match(/\(([^)]+)\)/)?.[1]
        ?.split(/[-–/]/)[0]
        .trim() ?? a.name.replace(/-\d+$/, "");
    const c = await geocode(city, cache);
    if (c) centers.set(a.id, c);
  }
  console.log(`geocoded: ${centers.size}`);

  const nearestArea = (lat: number, lon: number) => {
    let best: ServiceArea | undefined;
    let bd = 80_000;
    for (const a of areas) {
      const c = centers.get(a.id);
      if (!c) continue;
      const d = distanceM({ lat, lon }, { lat: c[0], lon: c[1] });
      if (d < bd) [bd, best] = [d, a];
    }
    return best;
  };

  // Cluster OSM towers within 1.5 km into one site (multiple broadcasters usually share a hill).
  const sites: { lat: number; lon: number; names: string[]; heights: number[]; osm: string[] }[] = [];
  for (const e of await osmTowers()) {
    const lat = e.center?.lat ?? e.lat!;
    const lon = e.center?.lon ?? e.lon!;
    const s = sites.find((s) => distanceM(s, { lat, lon }) < 1500);
    const h = parseFloat(e.tags?.height ?? "");
    const target = s ?? { lat, lon, names: [], heights: [], osm: [] };
    if (!s) sites.push(target);
    if (e.tags?.name) target.names.push(e.tags.name);
    if (h > 10 && h < 400) target.heights.push(h);
    target.osm.push(`${e.type}/${e.id}`);
  }
  console.log(`osm sites: ${sites.length}`);

  const tx: Transmitter[] = [];
  const covered = new Set<string>();

  // ISR first: licensed station coordinates. Stations of one area within 1.5 km = one site;
  // frequency = highest licensed channel at the site (worst case).
  const isr = await isrStations();
  if (!isr.length) throw new Error("ISR: 0 stations parsed; data/ left unchanged");
  const isrSites: { area: ServiceArea; lat: number; lon: number; ch: number[] }[] = [];
  for (const r of isr) {
    const k = slug(r.area);
    const a = areas.find((a) => a.id === k || a.id.startsWith(`${k}-`));
    if (!a) continue;
    const s = isrSites.find((s) => s.area === a && distanceM(s, r) < 1500);
    if (s) s.ch.push(r.ch);
    else isrSites.push({ area: a, lat: r.lat, lon: r.lon, ch: [r.ch] });
  }
  console.log(`isr stations: ${isr.length}, sites: ${isrSites.length}`);
  const perArea = new Map<string, number>();
  for (const s of isrSites) {
    const n = (perArea.get(s.area.id) ?? 0) + 1;
    perArea.set(s.area.id, n);
    covered.add(s.area.id);
    // Borrow tower height from an OSM-mapped tower at the same spot.
    const o = sites.find((o) => o.heights.length && distanceM(o, s) < 500);
    const h = o && Math.max(...o.heights);
    tx.push({
      id: `isr-${s.area.id}-${n}`,
      name: `Pemancar ${s.area.name}${n > 1 ? ` #${n}` : ""} (${s.ch.length} MUX)`,
      area: s.area.id,
      lat: +s.lat.toFixed(5),
      lon: +s.lon.toFixed(5),
      height_m: h || DEFAULT_HEIGHT_M,
      erp_kw: DEFAULT_ERP_KW,
      freq_mhz: uhfToMhz(Math.max(...s.ch)),
      confidence: { location: "isr", height: h ? "osm" : "estimated", erp: "estimated" },
      source: [ISR_PAGE, ...(o && h ? o.osm.map((x) => `https://www.openstreetmap.org/${x}`) : [])],
    });
  }

  // OSM towers only for areas without ISR data.
  for (const s of sites) {
    const a = nearestArea(s.lat, s.lon);
    if (!a || perArea.has(a.id)) continue;
    covered.add(a.id);
    const h = s.heights.length ? Math.max(...s.heights) : undefined;
    tx.push({
      id: `osm-${s.osm[0].replace("/", "-")}`,
      name: s.names[0] ?? `Menara TV ${a.name}`,
      area: a.id,
      lat: +s.lat.toFixed(5),
      lon: +s.lon.toFixed(5),
      height_m: h ?? DEFAULT_HEIGHT_M,
      erp_kw: DEFAULT_ERP_KW,
      freq_mhz: uhfToMhz(Math.max(...a.uhf)),
      confidence: { location: "osm", height: h ? "osm" : "estimated", erp: "estimated" },
      source: s.osm.map((o) => `https://www.openstreetmap.org/${o}`),
    });
  }
  // Areas that took part in analog switch-off but have no mapped tower: place at the geocoded city.
  for (const a of areas) {
    const c = centers.get(a.id);
    if (!a.aso || covered.has(a.id) || !c) continue;
    tx.push({
      id: `area-${a.id}`,
      name: `Perkiraan pemancar ${a.name}`,
      area: a.id,
      lat: +c[0].toFixed(5),
      lon: +c[1].toFixed(5),
      height_m: DEFAULT_HEIGHT_M,
      erp_kw: DEFAULT_ERP_KW,
      freq_mhz: uhfToMhz(Math.max(...a.uhf)),
      confidence: { location: "area-center", height: "estimated", erp: "estimated" },
      source: ["https://nominatim.openstreetmap.org/"],
    });
  }
  console.log(`transmitters: ${tx.length}`);
  writeFileSync("data/service-areas.json", JSON.stringify(areas, null, 1) + "\n");
  writeFileSync("data/transmitters.json", JSON.stringify(tx, null, 1) + "\n");
}

await main();
