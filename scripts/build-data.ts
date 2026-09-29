/**
 * Rebuild data/ from public sources. Run: node scripts/build-data.ts
 *
 *  data/service-areas.json  ← id.wikipedia.org "Televisi digital di Indonesia" (CC BY-SA 4.0)
 *  data/transmitters.json   ← OpenStreetMap via Overpass + Nominatim (ODbL 1.0)
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
  for (const s of sites) {
    const a = nearestArea(s.lat, s.lon);
    if (!a) continue;
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
