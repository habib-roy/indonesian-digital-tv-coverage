/**
 * ESA WorldCover 2021 v200 (10 m, CC BY 4.0) class at one point.
 * Hosted as COGs on Microsoft Planetary Computer; the AWS copy has no CORS.
 * Reads a single pixel through HTTP range requests (geotiff.js).
 */
import { fromUrl } from "geotiff";
import type { LatLon } from "./geo.ts";
import { WORLDCOVER } from "../../config.ts";

let token: { value: string; expires: number } | undefined;

async function sasToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const r = await fetch(WORLDCOVER.tokenUrl);
  if (!r.ok) throw new Error(`WorldCover token: HTTP ${r.status}`);
  const j = (await r.json()) as { token: string; "msft:expiry": string };
  token = { value: j.token, expires: Date.parse(j["msft:expiry"]) };
  return token.value;
}

/** WorldCover 3°×3° tile name, e.g. S09E105 (lower-left corner). */
export function worldCoverTile(p: LatLon): string {
  const lat = Math.floor(p.lat / 3) * 3;
  const lon = Math.floor(p.lon / 3) * 3;
  const ns = lat < 0 ? `S${String(-lat).padStart(2, "0")}` : `N${String(lat).padStart(2, "0")}`;
  const ew = lon < 0 ? `W${String(-lon).padStart(3, "0")}` : `E${String(lon).padStart(3, "0")}`;
  return ns + ew;
}

export async function landCoverAt(p: LatLon): Promise<number> {
  const url = `${WORLDCOVER.blobUrl}/ESA_WorldCover_10m_2021_v200_${worldCoverTile(p)}_Map.tif?${await sasToken()}`;
  const tiff = await fromUrl(url, { allowFullFile: false });
  const img = await tiff.getImage();
  const [x0, , , y1] = img.getBoundingBox();
  const [rx, ry] = img.getResolution();
  const px = Math.floor((p.lon - x0) / rx);
  const py = Math.floor((p.lat - y1) / ry); // ry is negative
  const rasters = await img.readRasters({ window: [px, py, px + 1, py + 1] });
  return Number((rasters[0] as ArrayLike<number>)[0]);
}
