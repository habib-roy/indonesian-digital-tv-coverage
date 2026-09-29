/** Data schema + validation shared by the app, scripts/validate-data.ts and tests. */

/** Indonesia UHF: 8 MHz raster, ch 21 centre = 474 MHz. */
export const uhfToMhz = (ch: number): number => 474 + (ch - 21) * 8;

export interface ServiceArea {
  id: string;
  name: string;
  regencies: string;
  uhf: number[];
  aso: boolean;
  source: string;
}

export type Confidence = "measured" | "osm" | "area-center" | "estimated";

export interface Transmitter {
  id: string;
  name: string;
  area: string;
  lat: number;
  lon: number;
  /** antenna height above ground (m) */
  height_m: number;
  erp_kw: number;
  /** worst-case (highest) allocated channel of the area — higher frequency = more loss */
  freq_mhz: number;
  confidence: { location: Confidence; height: Confidence; erp: Confidence };
  source: string[];
}

const inIndonesia = (lat: number, lon: number) => lat >= -11.5 && lat <= 6.5 && lon >= 94.5 && lon <= 141.5;
const isUrl = (s: unknown) => typeof s === "string" && /^https:\/\/\S+$/.test(s);

/** Returns a list of human-readable errors; empty = valid. */
export function validateData(areas: ServiceArea[], txs: Transmitter[]): string[] {
  const errs: string[] = [];
  const areaIds = new Set<string>();
  for (const a of areas) {
    if (!a.id || areaIds.has(a.id)) errs.push(`area id kosong/duplikat: ${a.id}`);
    areaIds.add(a.id);
    if (!a.uhf.length || a.uhf.some((c) => !Number.isInteger(c) || c < 21 || c > 69))
      errs.push(`area ${a.id}: kanal UHF tidak valid`);
    if (!isUrl(a.source)) errs.push(`area ${a.id}: source bukan URL https`);
  }
  const txIds = new Set<string>();
  for (const t of txs) {
    const p = `pemancar ${t.id}`;
    if (!t.id || txIds.has(t.id)) errs.push(`${p}: id kosong/duplikat`);
    txIds.add(t.id);
    if (!t.name) errs.push(`${p}: name kosong`);
    if (!areaIds.has(t.area)) errs.push(`${p}: area "${t.area}" tidak ada`);
    if (!inIndonesia(t.lat, t.lon)) errs.push(`${p}: koordinat di luar Indonesia`);
    if (!(t.height_m >= 1 && t.height_m <= 1000)) errs.push(`${p}: height_m di luar 1–1000`);
    if (!(t.erp_kw > 0 && t.erp_kw <= 200)) errs.push(`${p}: erp_kw di luar 0–200`);
    if (!(t.freq_mhz >= 470 && t.freq_mhz <= 862) || (t.freq_mhz - 474) % 8 !== 0) errs.push(`${p}: freq_mhz bukan kanal UHF`);
    if (!t.source?.length || !t.source.every(isUrl)) errs.push(`${p}: source wajib URL https`);
  }
  return errs;
}
