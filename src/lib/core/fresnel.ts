/**
 * Geometric path analysis for the profile chart and "blocked at km X" explanations.
 * The field strength itself comes from ITM; this is only for visualisation/explanation.
 */
import { knifeEdgeLoss } from "./clutter.ts";

const C = 299_792_458;
export const K_FACTOR = 4 / 3;
const EFFECTIVE_R = 6371e3 * K_FACTOR;

/** Earth bulge (m) at d1 from one end of a path of length d (m). */
export const earthBulge = (d1: number, d: number, re = EFFECTIVE_R): number => (d1 * (d - d1)) / (2 * re);

/** First Fresnel zone radius (m). */
export function fresnelRadius(d1: number, d: number, f__mhz: number): number {
  const d2 = d - d1;
  if (d1 <= 0 || d2 <= 0) return 0;
  const λ = C / (f__mhz * 1e6);
  return Math.sqrt((λ * d1 * d2) / d);
}

/** Free-space path loss (dB), distance in m. */
export const freeSpaceLoss = (d: number, f__mhz: number): number => 20 * Math.log10(d / 1000) + 20 * Math.log10(f__mhz) + 32.45;

export interface ProfilePoint {
  d: number; // m from transmitter
  ground: number; // terrain + earth bulge (m), in the chart's flat frame
  los: number; // straight TX→RX line height (m)
  fresnel: number; // 1st Fresnel radius (m)
  clearance: number; // los − ground (m); negative = blocked
}

export interface Obstruction {
  index: number;
  d: number;
  height: number; // terrain amsl (m)
  nu: number;
  loss: number; // knife-edge dB
}

export interface PathGeometry {
  points: ProfilePoint[];
  los: boolean; // 60% first Fresnel zone clear everywhere
  obstructions: Obstruction[]; // Deygout principal edges, TX→RX order
  deygoutLoss: number;
}

/**
 * @param pfl ITM profile [n, spacing, h0..hn] from transmitter to receiver
 * @param txH antenna height above ground at TX (m); rxH at RX
 */
export function analysePath(pfl: number[], txH: number, rxH: number, f__mhz: number): PathGeometry {
  const n = pfl[0];
  const dx = pfl[1];
  const d = n * dx;
  const λ = C / (f__mhz * 1e6);
  const hTx = pfl[2] + txH;
  const hRx = pfl[2 + n] + rxH;
  const points: ProfilePoint[] = [];
  let los = true;
  for (let i = 0; i <= n; i++) {
    const di = i * dx;
    const ground = pfl[2 + i] + earthBulge(di, d);
    const line = hTx + ((hRx - hTx) * di) / d;
    const fr = fresnelRadius(di, d, f__mhz);
    const clearance = line - ground;
    if (i > 0 && i < n && clearance < 0.6 * fr) los = false;
    points.push({ d: di, ground, los: line, fresnel: fr, clearance });
  }

  // Deygout: recursively pick the edge with the largest ν between two endpoints (max 3 edges).
  const obstructions: Obstruction[] = [];
  const edge = (a: number, b: number, ha: number, hb: number, depth: number): number => {
    if (depth > 2 || b - a < 2) return 0;
    let best = -Infinity;
    let bi = -1;
    const da = a * dx;
    const span = (b - a) * dx;
    for (let i = a + 1; i < b; i++) {
      const d1 = i * dx - da;
      const d2 = span - d1;
      const h = pfl[2 + i] + earthBulge(d1, span) - (ha + ((hb - ha) * d1) / span);
      const nu = h * Math.sqrt((2 * span) / (λ * d1 * d2));
      if (nu > best) {
        best = nu;
        bi = i;
      }
    }
    if (bi < 0 || best <= -0.78) return 0;
    const loss = knifeEdgeLoss(best);
    const top = pfl[2 + bi];
    obstructions.push({ index: bi, d: bi * dx, height: top, nu: best, loss });
    return loss + edge(a, bi, ha, top, depth + 1) + edge(bi, b, top, hb, depth + 1);
  };
  const deygoutLoss = edge(0, n, hTx, hRx, 0);
  obstructions.sort((p, q) => p.d - q.d);
  return { points, los, obstructions, deygoutLoss };
}
