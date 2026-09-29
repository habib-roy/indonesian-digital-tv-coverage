/** Spherical-earth geodesy helpers (mean radius). Accuracy ~0.5% — fine for 150 km TV paths. */

export const EARTH_RADIUS_M = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface LatLon {
  lat: number;
  lon: number;
}

export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing a→b, degrees clockwise from true north, 0..360. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = rad(a.lat);
  const φ2 = rad(b.lat);
  const Δλ = rad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Point at fraction t (0..1) along the great circle a→b. */
export function interpolate(a: LatLon, b: LatLon, t: number): LatLon {
  const φ1 = rad(a.lat),
    λ1 = rad(a.lon),
    φ2 = rad(b.lat),
    λ2 = rad(b.lon);
  const δ = distanceM(a, b) / EARTH_RADIUS_M;
  if (δ === 0) return { ...a };
  const A = Math.sin((1 - t) * δ) / Math.sin(δ);
  const B = Math.sin(t * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) };
}

const COMPASS = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"];
/** Indonesian 8-point compass label. */
export const compassLabel = (bearing: number): string => COMPASS[Math.round(bearing / 45) % 8];

/** Azimuth (true) & elevation (deg) of a geostationary satellite at `satLon` seen from `p`. */
export function geostationaryLook(p: LatLon, satLon: number): { azimuth: number; elevation: number } {
  const φ = rad(p.lat);
  const Δλ = rad(satLon - p.lon);
  const cosγ = Math.cos(φ) * Math.cos(Δλ);
  const γ = Math.acos(cosγ);
  const ratio = EARTH_RADIUS_M / 42164e3;
  const elevation = deg(Math.atan2(cosγ - ratio, Math.sin(γ)));
  const azimuth = (deg(Math.atan2(Math.sin(Δλ), -Math.sin(φ) * Math.cos(Δλ))) + 360) % 360;
  return { azimuth, elevation };
}
