/**
 * Irregular Terrain Model (ITM / Longley-Rice) v1.4 — point-to-point mode.
 *
 * Line-by-line TypeScript port of the NTIA/ITS reference implementation:
 *   https://github.com/NTIA/itm  (src/*.cpp)
 * The original is a work of the U.S. Government and not subject to copyright
 * (15 U.S.C. §105). This port keeps function names and equation references so
 * it can be diffed against upstream. Verified in test/itm.test.ts against the
 * compiled C++ reference.
 *
 * Profile format (`pfl`) is identical to upstream:
 *   pfl[0] = number of intervals (points - 1)
 *   pfl[1] = spacing between points, meters
 *   pfl[2..] = terrain elevations, meters (tx first, rx last)
 */

export const Climate = {
  Equatorial: 1,
  ContinentalSubtropical: 2,
  MaritimeSubtropical: 3,
  Desert: 4,
  ContinentalTemperate: 5,
  MaritimeTemperateOverLand: 6,
  MaritimeTemperateOverSea: 7,
} as const;

export const Polarization = { Horizontal: 0, Vertical: 1 } as const;
export const Mdvar = { SingleMessage: 0, Accidental: 1, Mobile: 2, Broadcast: 3 } as const;
export const PropMode = { NotSet: 0, LineOfSight: 1, Diffraction: 2, Troposcatter: 3 } as const;

export interface ItmInput {
  h_tx__meter: number;
  h_rx__meter: number;
  pfl: readonly number[];
  climate: number;
  N_0: number;
  f__mhz: number;
  pol: number;
  epsilon: number;
  sigma: number;
  mdvar: number;
  time: number;
  location: number;
  situation: number;
}

export interface ItmResult {
  A__db: number;
  A_fs__db: number;
  A_ref__db: number;
  d__km: number;
  theta_hzn: [number, number];
  d_hzn__meter: [number, number];
  h_e__meter: [number, number];
  N_s: number;
  delta_h__meter: number;
  mode: number;
  warnings: number;
}

type Pair = [number, number];

// ---- constants (include/itm.h) ----
const PI = Math.PI;
const SQRT2 = Math.SQRT2;
const a_0__meter = 6370e3;
const a_9000__meter = 9000e3;
const THIRD = 1.0 / 3.0;

// ---- warning flags (include/Warnings.h) ----
const WARN__TX_TERMINAL_HEIGHT = 0x0001;
const WARN__RX_TERMINAL_HEIGHT = 0x0002;
const WARN__FREQUENCY = 0x0004;
const WARN__PATH_DISTANCE_TOO_BIG_1 = 0x0008;
const WARN__PATH_DISTANCE_TOO_BIG_2 = 0x0010;
const WARN__PATH_DISTANCE_TOO_SMALL_1 = 0x0020;
const WARN__PATH_DISTANCE_TOO_SMALL_2 = 0x0040;
const WARN__TX_HORIZON_ANGLE = 0x0080;
const WARN__RX_HORIZON_ANGLE = 0x0100;
const WARN__TX_HORIZON_DISTANCE_1 = 0x0200;
const WARN__RX_HORIZON_DISTANCE_1 = 0x0400;
const WARN__TX_HORIZON_DISTANCE_2 = 0x0800;
const WARN__RX_HORIZON_DISTANCE_2 = 0x1000;
const WARN__EXTREME_VARIABILITIES = 0x2000;
const WARN__SURFACE_REFRACTIVITY = 0x4000;

export class ItmError extends Error {}

// ---- tiny complex helpers ----
interface C {
  re: number;
  im: number;
}
const c = (re: number, im = 0): C => ({ re, im });
const cadd = (a: C, b: C): C => c(a.re + b.re, a.im + b.im);
const csub = (a: C, b: C): C => c(a.re - b.re, a.im - b.im);
const cdiv = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im;
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const cscale = (a: C, s: number): C => c(a.re * s, a.im * s);
const cabs = (a: C): number => Math.hypot(a.re, a.im);
const csqrt = (a: C): C => {
  // principal square root, matches std::sqrt(complex)
  const r = cabs(a);
  const re = Math.sqrt((r + a.re) / 2);
  const im = Math.sqrt((r - a.re) / 2);
  return c(re, a.im < 0 ? -im : im);
};

const fdim = (x: number, y: number): number => (x > y ? x - y : 0);
const DIM = fdim;
const trunc = Math.trunc;

// ---- ValidateInputs.cpp ----
function validateInputs(i: ItmInput): number {
  let w = 0;
  if (i.h_tx__meter < 1 || i.h_tx__meter > 1000) w |= WARN__TX_TERMINAL_HEIGHT;
  if (i.h_tx__meter < 0.5 || i.h_tx__meter > 3000) throw new ItmError("TX terminal height");
  if (i.h_rx__meter < 1 || i.h_rx__meter > 1000) w |= WARN__RX_TERMINAL_HEIGHT;
  if (i.h_rx__meter < 0.5 || i.h_rx__meter > 3000) throw new ItmError("RX terminal height");
  if (i.climate < 1 || i.climate > 7) throw new ItmError("climate");
  if (i.N_0 < 250 || i.N_0 > 400) throw new ItmError("refractivity");
  if (i.f__mhz < 40 || i.f__mhz > 10000) w |= WARN__FREQUENCY;
  if (i.f__mhz < 20 || i.f__mhz > 20000) throw new ItmError("frequency");
  if (i.pol !== 0 && i.pol !== 1) throw new ItmError("polarization");
  if (i.epsilon < 1) throw new ItmError("epsilon");
  if (i.sigma <= 0) throw new ItmError("sigma");
  if (i.mdvar < 0 || i.mdvar > 33 || i.mdvar % 10 > 3) throw new ItmError("mdvar");
  for (const [name, v] of [
    ["situation", i.situation],
    ["time", i.time],
    ["location", i.location],
  ] as const) {
    if (v <= 0 || v >= 100) throw new ItmError(name);
  }
  return w;
}

// ---- InitializePointToPoint.cpp ----
function initializePointToPoint(f__mhz: number, h_sys__meter: number, N_0: number, pol: number, epsilon: number, sigma: number) {
  const gamma_a = 157e-9;
  const N_s = h_sys__meter === 0.0 ? N_0 : N_0 * Math.exp(-h_sys__meter / 9460.0);
  const gamma_e = gamma_a * (1.0 - 0.04665 * Math.exp(N_s / 179.3));
  const ep_r = c(epsilon, (18000 * sigma) / f__mhz);
  let Z_g = csqrt(csub(ep_r, c(1)));
  if (pol === Polarization.Vertical) Z_g = cdiv(Z_g, ep_r);
  return { Z_g, gamma_e, N_s };
}

// ---- LinearLeastSquaresFit.cpp ----
export function linearLeastSquaresFit(pfl: readonly number[], d_start: number, d_end: number): Pair {
  const np = trunc(pfl[0]);
  let i_start = trunc(fdim(d_start / pfl[1], 0.0));
  let i_end = np - trunc(fdim(np, d_end / pfl[1]));
  if (i_end <= i_start) {
    i_start = trunc(fdim(i_start, 1.0));
    i_end = np - trunc(fdim(np, i_end + 1.0));
  }
  const x_length = i_end - i_start;
  let mid_shifted_index = -0.5 * x_length;
  const mid_shifted_end = i_end + mid_shifted_index;
  let sum_y = 0.5 * (pfl[i_start + 2] + pfl[i_end + 2]);
  let scaled_sum_y = 0.5 * (pfl[i_start + 2] - pfl[i_end + 2]) * mid_shifted_index;
  for (let i = 2; i <= x_length; i++) {
    i_start++;
    mid_shifted_index++;
    sum_y += pfl[i_start + 2];
    scaled_sum_y += pfl[i_start + 2] * mid_shifted_index;
  }
  sum_y = sum_y / x_length;
  scaled_sum_y = (scaled_sum_y * 12.0) / ((x_length * x_length + 2.0) * x_length);
  return [sum_y - scaled_sum_y * mid_shifted_end, sum_y + scaled_sum_y * (np - mid_shifted_end)];
}

// ---- FindHorizons.cpp ----
function findHorizons(pfl: readonly number[], a_e__meter: number, h__meter: Pair) {
  const np = trunc(pfl[0]);
  const xi = pfl[1];
  const d__meter = pfl[0] * pfl[1];
  const z_tx__meter = pfl[2] + h__meter[0];
  const z_rx__meter = pfl[np + 2] + h__meter[1];
  const theta_hzn: Pair = [
    (z_rx__meter - z_tx__meter) / d__meter - d__meter / (2 * a_e__meter),
    -(z_rx__meter - z_tx__meter) / d__meter - d__meter / (2 * a_e__meter),
  ];
  const d_hzn__meter: Pair = [d__meter, d__meter];
  let d_tx__meter = 0.0;
  let d_rx__meter = d__meter;
  for (let i = 1; i < np; i++) {
    d_tx__meter = d_tx__meter + xi;
    d_rx__meter = d_rx__meter - xi;
    const theta_tx = (pfl[i + 2] - z_tx__meter) / d_tx__meter - d_tx__meter / (2 * a_e__meter);
    const theta_rx = -(z_rx__meter - pfl[i + 2]) / d_rx__meter - d_rx__meter / (2 * a_e__meter);
    if (theta_tx > theta_hzn[0]) {
      theta_hzn[0] = theta_tx;
      d_hzn__meter[0] = d_tx__meter;
    }
    if (theta_rx > theta_hzn[1]) {
      theta_hzn[1] = theta_rx;
      d_hzn__meter[1] = d_rx__meter;
    }
  }
  return { theta_hzn, d_hzn__meter };
}

// ---- ComputeDeltaH.cpp ----
function computeDeltaH(pfl: readonly number[], d_start__meter: number, d_end__meter: number): number {
  const s = new Array<number>(247).fill(0);
  const np = trunc(pfl[0]);
  let x_start = d_start__meter / pfl[1];
  let x_end = d_end__meter / pfl[1];
  if (x_end - x_start < 2.0) return 0;
  let p10 = trunc(0.1 * (x_end - x_start + 8.0));
  p10 = Math.min(Math.max(4, p10), 25);
  const n = 10 * p10 - 5;
  const p90 = n - p10;
  const np_s = n - 1;
  s[0] = np_s;
  s[1] = 1.0;
  x_end = (x_end - x_start) / np_s;
  let i = trunc(x_start);
  x_start -= i + 1.0;
  for (let j = 0; j < n; j++) {
    while (x_start > 0.0 && i + 1 < np) {
      x_start--;
      i++;
    }
    s[j + 2] = pfl[i + 3] + (pfl[i + 3] - pfl[i + 2]) * x_start;
    x_start += x_end;
  }
  let [fit_y1, fit_y2] = linearLeastSquaresFit(s, 0.0, np_s);
  fit_y2 = (fit_y2 - fit_y1) / np_s;
  const diffs: number[] = [];
  for (let j = 0; j < n; j++) {
    diffs.push(s[j + 2] - fit_y1);
    fit_y1 += fit_y2;
  }
  // nth_element with std::greater == value at that rank of a descending sort
  diffs.sort((a, b) => b - a);
  const q10 = diffs[p10 - 1];
  const q90 = diffs[p90];
  const delta_h_d__meter = q10 - q90;
  return delta_h_d__meter / (1.0 - 0.8 * Math.exp(-(d_end__meter - d_start__meter) / 50e3));
}

// ---- QuickPfl.cpp ----
function quickPfl(pfl: readonly number[], gamma_e: number, h__meter: Pair) {
  const d__meter = pfl[0] * pfl[1];
  const np = trunc(pfl[0]);
  const a_e__meter = 1 / gamma_e;
  const { theta_hzn, d_hzn__meter } = findHorizons(pfl, a_e__meter, h__meter);
  const h_e__meter: Pair = [0, 0];
  const d_start__meter = Math.min(15.0 * h__meter[0], 0.1 * d_hzn__meter[0]);
  const d_end__meter = d__meter - Math.min(15.0 * h__meter[1], 0.1 * d_hzn__meter[1]);
  const delta_h__meter = computeDeltaH(pfl, d_start__meter, d_end__meter);

  if (d_hzn__meter[0] + d_hzn__meter[1] > 1.5 * d__meter) {
    const [fit_tx, fit_rx] = linearLeastSquaresFit(pfl, d_start__meter, d_end__meter);
    h_e__meter[0] = h__meter[0] + fdim(pfl[2], fit_tx);
    h_e__meter[1] = h__meter[1] + fdim(pfl[np + 2], fit_rx);
    for (let i = 0; i < 2; i++)
      d_hzn__meter[i] =
        Math.sqrt(2.0 * h_e__meter[i] * a_e__meter) * Math.exp(-0.07 * Math.sqrt(delta_h__meter / Math.max(h_e__meter[i], 5.0)));
    const combined = d_hzn__meter[0] + d_hzn__meter[1];
    if (combined <= d__meter) {
      const q = Math.pow(d__meter / combined, 2);
      for (let i = 0; i < 2; i++) {
        h_e__meter[i] = h_e__meter[i] * q;
        d_hzn__meter[i] =
          Math.sqrt(2.0 * h_e__meter[i] * a_e__meter) *
          Math.exp(-0.07 * Math.sqrt(delta_h__meter / Math.max(h_e__meter[i], 5.0)));
      }
    }
    for (let i = 0; i < 2; i++) {
      const q = Math.sqrt(2.0 * h_e__meter[i] * a_e__meter);
      theta_hzn[i] = (0.65 * delta_h__meter * (q / d_hzn__meter[i] - 1.0) - 2.0 * h_e__meter[i]) / q;
    }
  } else {
    const [fit_tx] = linearLeastSquaresFit(pfl, d_start__meter, 0.9 * d_hzn__meter[0]);
    h_e__meter[0] = h__meter[0] + fdim(pfl[2], fit_tx);
    const [, fit_rx] = linearLeastSquaresFit(pfl, d__meter - 0.9 * d_hzn__meter[1], d_end__meter);
    h_e__meter[1] = h__meter[1] + fdim(pfl[np + 2], fit_rx);
  }
  return { theta_hzn, d_hzn__meter, h_e__meter, delta_h__meter, d__meter };
}

// ---- small functions ----
export const freeSpaceLoss = (d__meter: number, f__mhz: number): number =>
  32.45 + 20.0 * Math.log10(f__mhz) + 20.0 * Math.log10(d__meter / 1000.0);

const fresnelIntegral = (v2: number): number =>
  v2 < 5.76 ? 6.02 + 9.11 * Math.sqrt(v2) - 1.27 * v2 : 12.953 + 10 * Math.log10(v2);

const terrainRoughness = (d__meter: number, delta_h__meter: number): number =>
  delta_h__meter * (1.0 - 0.8 * Math.exp(-d__meter / 50e3));

const sigmaHFunction = (delta_h__meter: number): number =>
  0.78 * delta_h__meter * Math.exp(-0.5 * Math.pow(delta_h__meter, 0.25));

function h0Curve(j: number, r: number): number {
  const a = [25.0, 80.0, 177.0, 395.0, 705.0];
  const b = [24.0, 45.0, 68.0, 80.0, 105.0];
  return 10 * Math.log10(1 + a[j] * Math.pow(1 / r, 4) + b[j] * Math.pow(1.0 / r, 2));
}

function h0Function(r: number, eta_s: number): number {
  eta_s = Math.min(Math.max(eta_s, 1), 5);
  const i = trunc(eta_s);
  const q = eta_s - i;
  let result = h0Curve(i - 1, r);
  if (q !== 0.0) result = (1.0 - q) * result + q * h0Curve(i, r);
  return result;
}

export function inverseCCDF(q: number): number {
  const C_0 = 2.515516,
    C_1 = 0.802853,
    C_2 = 0.010328;
  const D_1 = 1.432788,
    D_2 = 0.189269,
    D_3 = 0.001308;
  let x = q;
  if (q > 0.5) x = 1.0 - x;
  const T_x = Math.sqrt(-2.0 * Math.log(x));
  const zeta_x = ((C_2 * T_x + C_1) * T_x + C_0) / (((D_3 * T_x + D_2) * T_x + D_1) * T_x + 1.0);
  let Q_q = T_x - zeta_x;
  if (q > 0.5) Q_q = -Q_q;
  return Q_q;
}

// ---- KnifeEdgeDiffraction.cpp ----
function knifeEdgeDiffraction(
  d__meter: number,
  f__mhz: number,
  a_e__meter: number,
  theta_los: number,
  d_hzn__meter: Pair,
): number {
  const d_ML__meter = d_hzn__meter[0] + d_hzn__meter[1];
  const theta_nlos = d__meter / a_e__meter - theta_los;
  const d_nlos__meter = d__meter - d_ML__meter;
  const k = 0.0795775 * (f__mhz / 47.7) * Math.pow(theta_nlos, 2);
  const v_1 = (k * d_hzn__meter[0] * d_nlos__meter) / (d_nlos__meter + d_hzn__meter[0]);
  const v_2 = (k * d_hzn__meter[1] * d_nlos__meter) / (d_nlos__meter + d_hzn__meter[1]);
  return fresnelIntegral(v_1) + fresnelIntegral(v_2);
}

// ---- SmoothEarthDiffraction.cpp ----
function heightFunction(x__km: number, K: number): number {
  let result: number;
  if (x__km < 200.0) {
    const w = -Math.log(K);
    if (K < 1e-5 || x__km * Math.pow(w, 3) > 5495.0) {
      result = -117.0;
      if (x__km > 1.0) result = 17.372 * Math.log(x__km) + result;
    } else result = (2.5e-5 * Math.pow(x__km, 2)) / K - 8.686 * w - 15.0;
  } else {
    result = 0.05751 * x__km - 4.343 * Math.log(x__km);
    if (x__km < 2000) {
      const w = 0.0134 * x__km * Math.exp(-0.005 * x__km);
      result = (1.0 - w) * result + w * (17.372 * Math.log(x__km) - 117.0);
    }
  }
  return result;
}

function smoothEarthDiffraction(
  d__meter: number,
  f__mhz: number,
  a_e__meter: number,
  theta_los: number,
  d_hzn__meter: Pair,
  h_e__meter: Pair,
  Z_g: C,
): number {
  const theta_nlos = d__meter / a_e__meter - theta_los;
  const d_ML__meter = d_hzn__meter[0] + d_hzn__meter[1];
  const a__meter = [
    (d__meter - d_ML__meter) / (d__meter / a_e__meter - theta_los),
    (0.5 * Math.pow(d_hzn__meter[0], 2)) / h_e__meter[0],
    (0.5 * Math.pow(d_hzn__meter[1], 2)) / h_e__meter[1],
  ];
  const d__km = [(a__meter[0] * theta_nlos) / 1000.0, d_hzn__meter[0] / 1000.0, d_hzn__meter[1] / 1000.0];
  const C_0: number[] = [],
    K: number[] = [],
    B_0: number[] = [];
  for (let i = 0; i < 3; i++) {
    C_0[i] = Math.pow(((4.0 / 3.0) * a_0__meter) / a__meter[i], THIRD);
    K[i] = (0.017778 * C_0[i] * Math.pow(f__mhz, -THIRD)) / cabs(Z_g);
    B_0[i] = 1.607 - K[i];
  }
  const x1 = B_0[1] * Math.pow(C_0[1], 2) * Math.pow(f__mhz, THIRD) * d__km[1];
  const x2 = B_0[2] * Math.pow(C_0[2], 2) * Math.pow(f__mhz, THIRD) * d__km[2];
  const x0 = B_0[0] * Math.pow(C_0[0], 2) * Math.pow(f__mhz, THIRD) * d__km[0] + x1 + x2;
  const F0 = heightFunction(x1, K[1]);
  const F1 = heightFunction(x2, K[2]);
  const G_x__db = 0.05751 * x0 - 10.0 * Math.log10(x0);
  return G_x__db - F0 - F1 - 20;
}

// ---- DiffractionLoss.cpp ----
function diffractionLoss(
  d__meter: number,
  d_hzn__meter: Pair,
  h_e__meter: Pair,
  Z_g: C,
  a_e__meter: number,
  delta_h__meter: number,
  h__meter: Pair,
  theta_los: number,
  d_sML__meter: number,
  f__mhz: number,
): number {
  const A_k__db = knifeEdgeDiffraction(d__meter, f__mhz, a_e__meter, theta_los, d_hzn__meter);
  const A_se__db = smoothEarthDiffraction(d__meter, f__mhz, a_e__meter, theta_los, d_hzn__meter, h_e__meter, Z_g);
  const sigma_h_d__meter = sigmaHFunction(terrainRoughness(d_sML__meter, delta_h__meter));
  const A_fo__db = Math.min(15.0, 5 * Math.log10(1.0 + 1e-5 * h__meter[0] * h__meter[1] * f__mhz * sigma_h_d__meter));
  const delta_h_d__meter = terrainRoughness(d__meter, delta_h__meter);
  let q = h__meter[0] * h__meter[1];
  const qk = h_e__meter[0] * h_e__meter[1] - q;
  q += 10.0; // MODE__P2P
  const term1 = Math.sqrt(1.0 + qk / q);
  const d_ML__meter = d_hzn__meter[0] + d_hzn__meter[1];
  q = (term1 + (-theta_los * a_e__meter + d_ML__meter) / d__meter) * Math.min((delta_h_d__meter * f__mhz) / 47.7, 6283.2);
  const w = 25.1 / (25.1 + Math.sqrt(q));
  return w * A_se__db + (1.0 - w) * A_k__db + A_fo__db;
}

// ---- LineOfSightLoss.cpp ----
function lineOfSightLoss(
  d__meter: number,
  h_e__meter: Pair,
  Z_g: C,
  delta_h__meter: number,
  M_d: number,
  A_d0: number,
  d_sML__meter: number,
  f__mhz: number,
): number {
  const sigma_h_d__meter = sigmaHFunction(terrainRoughness(d__meter, delta_h__meter));
  const wn = f__mhz / 47.7;
  const hsum = h_e__meter[0] + h_e__meter[1];
  const sin_psi = hsum / Math.sqrt(Math.pow(d__meter, 2) + Math.pow(hsum, 2));
  let R_e = cscale(
    cdiv(csub(c(sin_psi), Z_g), cadd(c(sin_psi), Z_g)),
    Math.exp(-Math.min(10.0, wn * sigma_h_d__meter * sin_psi)),
  );
  const q = R_e.re * R_e.re + R_e.im * R_e.im;
  if (q < 0.25 || q < sin_psi) R_e = cscale(R_e, Math.sqrt(sin_psi / q));
  let delta_phi = (wn * 2.0 * h_e__meter[0] * h_e__meter[1]) / d__meter;
  if (delta_phi > PI / 2.0) delta_phi = PI - Math.pow(PI / 2.0, 2) / delta_phi;
  const rr = cadd(c(Math.cos(delta_phi), -Math.sin(delta_phi)), R_e);
  const A_t__db = -10 * Math.log10(rr.re * rr.re + rr.im * rr.im);
  const A_d__db = M_d * d__meter + A_d0;
  const w = 1 / (1 + (f__mhz * delta_h__meter) / Math.max(10e3, d_sML__meter));
  return w * A_t__db + (1 - w) * A_d__db;
}

// ---- TroposcatterLoss.cpp ----
function fFunction(td: number): number {
  const a = [133.4, 104.6, 71.8];
  const b = [0.332e-3, 0.212e-3, 0.157e-3];
  const cc = [-10, -2.5, 5];
  const i = td <= 10e3 ? 0 : td <= 70e3 ? 1 : 2;
  return a[i] + b[i] * td + cc[i] * Math.log10(td);
}

function troposcatterLoss(
  d__meter: number,
  theta_hzn: Pair,
  d_hzn__meter: Pair,
  h_e__meter: Pair,
  a_e__meter: number,
  N_s: number,
  f__mhz: number,
  theta_los: number,
  h0: { v: number },
): number {
  let H_0: number;
  const wn = f__mhz / 47.7;
  if (h0.v > 15.0) H_0 = h0.v;
  else {
    let ad = d_hzn__meter[0] - d_hzn__meter[1];
    let rr = h_e__meter[1] / h_e__meter[0];
    if (ad < 0.0) {
      ad = -ad;
      rr = 1.0 / rr;
    }
    const theta = theta_hzn[0] + theta_hzn[1] + d__meter / a_e__meter;
    const r_1 = 2.0 * wn * theta * h_e__meter[0];
    const r_2 = 2.0 * wn * theta * h_e__meter[1];
    if (r_1 < 0.2 && r_2 < 0.2) return 1001;
    let s = (d__meter - ad) / (d__meter + ad);
    const q = Math.min(Math.max(0.1, rr / s), 10.0);
    s = Math.max(0.1, s);
    const h_0__meter = ((d__meter - ad) * (d__meter + ad) * theta * 0.25) / d__meter;
    const Z_0__meter = 1.7556e3;
    const Z_1__meter = 8.0e3;
    const eta_s =
      (h_0__meter / Z_0__meter) *
      (1.0 +
        (0.031 - N_s * 2.32e-3 + Math.pow(N_s, 2) * 5.67e-6) * Math.exp(-Math.pow(Math.min(1.7, h_0__meter / Z_1__meter), 6)));
    const H_00 = (h0Function(r_1, eta_s) + h0Function(r_2, eta_s)) / 2;
    const Delta_H_0 = Math.min(H_00, 6.0 * (0.6 - Math.log10(Math.max(eta_s, 1.0))) * Math.log10(s) * Math.log10(q));
    H_0 = Math.max(H_00 + Delta_H_0, 0.0);
    if (eta_s < 1.0)
      H_0 =
        eta_s * H_0 +
        (1.0 - eta_s) *
          10 *
          Math.log10((Math.pow((1.0 + SQRT2 / r_1) * (1.0 + SQRT2 / r_2), 2) * (r_1 + r_2)) / (r_1 + r_2 + 2 * SQRT2));
    if (H_0 > 15.0 && h0.v >= 0.0) H_0 = h0.v;
  }
  h0.v = H_0;
  const th = d__meter / a_e__meter - theta_los;
  const D_0__meter = 40e3;
  const H__meter = 47.7;
  return (
    fFunction(th * d__meter) +
    10 * Math.log10(wn * H__meter * Math.pow(th, 4)) -
    0.1 * (N_s - 301.0) * Math.exp((-th * d__meter) / D_0__meter) +
    H_0
  );
}

// ---- LongleyRice.cpp ----
function longleyRice(
  theta_hzn: Pair,
  f__mhz: number,
  Z_g: C,
  d_hzn__meter: Pair,
  h_e__meter: Pair,
  gamma_e: number,
  N_s: number,
  delta_h__meter: number,
  h__meter: Pair,
  d__meter: number,
) {
  let warnings = 0;
  const a_e__meter = 1 / gamma_e;
  const d_hzn_s__meter: Pair = [Math.sqrt(2.0 * h_e__meter[0] * a_e__meter), Math.sqrt(2.0 * h_e__meter[1] * a_e__meter)];
  const d_sML__meter = d_hzn_s__meter[0] + d_hzn_s__meter[1];
  const d_ML__meter = d_hzn__meter[0] + d_hzn__meter[1];
  const theta_los = -Math.max(theta_hzn[0] + theta_hzn[1], -d_ML__meter / a_e__meter);

  if (Math.abs(theta_hzn[0]) > 200e-3) warnings |= WARN__TX_HORIZON_ANGLE;
  if (Math.abs(theta_hzn[1]) > 200e-3) warnings |= WARN__RX_HORIZON_ANGLE;
  if (d_hzn__meter[0] < 0.1 * d_hzn_s__meter[0]) warnings |= WARN__TX_HORIZON_DISTANCE_1;
  if (d_hzn__meter[1] < 0.1 * d_hzn_s__meter[1]) warnings |= WARN__RX_HORIZON_DISTANCE_1;
  if (d_hzn__meter[0] > 3.0 * d_hzn_s__meter[0]) warnings |= WARN__TX_HORIZON_DISTANCE_2;
  if (d_hzn__meter[1] > 3.0 * d_hzn_s__meter[1]) warnings |= WARN__RX_HORIZON_DISTANCE_2;
  if (N_s < 150) throw new ItmError("surface refractivity small");
  if (N_s > 400) throw new ItmError("surface refractivity large");
  if (N_s < 250) warnings |= WARN__SURFACE_REFRACTIVITY;
  if (a_e__meter < 4000000 || a_e__meter > 13333333) throw new ItmError("effective earth");
  if (Z_g.re <= Math.abs(Z_g.im)) throw new ItmError("ground impedance");

  const k3 = Math.pow(Math.pow(a_e__meter, 2) / f__mhz, 1.0 / 3.0);
  const d_3__meter = Math.max(d_sML__meter, d_ML__meter + 5.0 * k3);
  const d_4__meter = d_3__meter + 10.0 * k3;
  const dl = (d: number) =>
    diffractionLoss(d, d_hzn__meter, h_e__meter, Z_g, a_e__meter, delta_h__meter, h__meter, theta_los, d_sML__meter, f__mhz);
  const A_3__db = dl(d_3__meter);
  const A_4__db = dl(d_4__meter);
  const M_d = (A_4__db - A_3__db) / (d_4__meter - d_3__meter);
  const A_d0__db = A_3__db - M_d * d_3__meter;

  const d_min__meter = Math.abs(h_e__meter[0] - h_e__meter[1]) / 200e-3;
  if (d__meter < d_min__meter) warnings |= WARN__PATH_DISTANCE_TOO_SMALL_1;
  if (d__meter < 1e3) warnings |= WARN__PATH_DISTANCE_TOO_SMALL_2;
  if (d__meter > 1000e3) warnings |= WARN__PATH_DISTANCE_TOO_BIG_1;
  if (d__meter > 2000e3) warnings |= WARN__PATH_DISTANCE_TOO_BIG_2;

  let A_ref__db: number;
  let propmode: number;
  if (d__meter < d_sML__meter) {
    const los = (d: number) => lineOfSightLoss(d, h_e__meter, Z_g, delta_h__meter, M_d, A_d0__db, d_sML__meter, f__mhz);
    const A_sML__db = d_sML__meter * M_d + A_d0__db;
    let d_0__meter = 0.04 * f__mhz * h_e__meter[0] * h_e__meter[1];
    let d_1__meter: number;
    if (A_d0__db >= 0.0) {
      d_0__meter = Math.min(d_0__meter, 0.5 * d_ML__meter);
      d_1__meter = d_0__meter + 0.25 * (d_ML__meter - d_0__meter);
    } else d_1__meter = Math.max(-A_d0__db / M_d, 0.25 * d_ML__meter);
    const A_1__db = los(d_1__meter);
    let flag = false;
    let kHat_1 = 0;
    let kHat_2 = 0;
    if (d_0__meter < d_1__meter) {
      const A_0__db = los(d_0__meter);
      const q = Math.log(d_sML__meter / d_0__meter);
      kHat_2 = Math.max(
        0.0,
        ((d_sML__meter - d_0__meter) * (A_1__db - A_0__db) - (d_1__meter - d_0__meter) * (A_sML__db - A_0__db)) /
          ((d_sML__meter - d_0__meter) * Math.log(d_1__meter / d_0__meter) - (d_1__meter - d_0__meter) * q),
      );
      flag = A_d0__db > 0.0 || kHat_2 > 0.0;
      if (flag) {
        kHat_1 = (A_sML__db - A_0__db - kHat_2 * q) / (d_sML__meter - d_0__meter);
        if (kHat_1 < 0.0) {
          kHat_1 = 0.0;
          kHat_2 = DIM(A_sML__db, A_0__db) / q;
          if (kHat_2 === 0.0) kHat_1 = M_d;
        }
      }
    }
    if (!flag) {
      kHat_1 = DIM(A_sML__db, A_1__db) / (d_sML__meter - d_1__meter);
      kHat_2 = 0.0;
      if (kHat_1 === 0.0) kHat_1 = M_d;
    }
    const A_o__db = A_sML__db - kHat_1 * d_sML__meter - kHat_2 * Math.log(d_sML__meter);
    A_ref__db = A_o__db + kHat_1 * d__meter + kHat_2 * Math.log(d__meter);
    propmode = PropMode.LineOfSight;
  } else {
    const d_5__meter = d_ML__meter + 200e3;
    const d_6__meter = d_ML__meter + 400e3;
    const h0 = { v: -1 };
    const A_6__db = troposcatterLoss(d_6__meter, theta_hzn, d_hzn__meter, h_e__meter, a_e__meter, N_s, f__mhz, theta_los, h0);
    const A_5__db = troposcatterLoss(d_5__meter, theta_hzn, d_hzn__meter, h_e__meter, a_e__meter, N_s, f__mhz, theta_los, h0);
    let M_s: number, A_s0__db: number, d_x__meter: number;
    if (A_5__db < 1000.0) {
      M_s = (A_6__db - A_5__db) / 200e3;
      d_x__meter = Math.max(
        Math.max(d_sML__meter, d_ML__meter + 1.088 * k3 * Math.log(f__mhz)),
        (A_5__db - A_d0__db - M_s * d_5__meter) / (M_d - M_s),
      );
      A_s0__db = (M_d - M_s) * d_x__meter + A_d0__db;
    } else {
      M_s = M_d;
      A_s0__db = A_d0__db;
      d_x__meter = 10e6;
    }
    if (d__meter > d_x__meter) {
      A_ref__db = M_s * d__meter + A_s0__db;
      propmode = PropMode.Troposcatter;
    } else {
      A_ref__db = M_d * d__meter + A_d0__db;
      propmode = PropMode.Diffraction;
    }
  }
  return { A_ref__db: Math.max(A_ref__db, 0.0), propmode, warnings };
}

// ---- Variability.cpp ----
const curve = (c1: number, c2: number, x1: number, x2: number, x3: number, d_e: number): number =>
  ((c1 + c2 / (1.0 + Math.pow((d_e - x2) / x3, 2))) * Math.pow(d_e / x1, 2)) / (1.0 + Math.pow(d_e / x1, 2));

function variability(
  time: number,
  location: number,
  situation: number,
  h_e__meter: Pair,
  delta_h__meter: number,
  f__mhz: number,
  d__meter: number,
  A_ref__db: number,
  climate: number,
  mdvar: number,
): { value: number; warnings: number } {
  let warnings = 0;
  const all_year = [
    [-9.67, -0.62, 1.26, -9.21, -0.62, -0.39, 3.15],
    [12.7, 9.19, 15.5, 9.05, 9.19, 2.86, 857.9],
    [144.9e3, 228.9e3, 262.6e3, 84.1e3, 228.9e3, 141.7e3, 2222e3],
    [190.3e3, 205.2e3, 185.2e3, 101.1e3, 205.2e3, 315.9e3, 164.8e3],
    [133.8e3, 143.6e3, 99.8e3, 98.6e3, 143.6e3, 167.4e3, 116.3e3],
  ];
  const bsm1 = [2.13, 2.66, 6.11, 1.98, 2.68, 6.86, 8.51];
  const bsm2 = [159.5, 7.67, 6.65, 13.11, 7.16, 10.38, 169.8];
  const xsm1 = [762.2e3, 100.4e3, 138.2e3, 139.1e3, 93.7e3, 187.8e3, 609.8e3];
  const xsm2 = [123.6e3, 172.5e3, 242.2e3, 132.7e3, 186.8e3, 169.6e3, 119.9e3];
  const xsm3 = [94.5e3, 136.4e3, 178.6e3, 193.5e3, 133.5e3, 108.9e3, 106.6e3];
  const bsp1 = [2.11, 6.87, 10.08, 3.68, 4.75, 8.58, 8.43];
  const bsp2 = [102.3, 15.53, 9.6, 159.3, 8.12, 13.97, 8.19];
  const xsp1 = [636.9e3, 138.7e3, 165.3e3, 464.4e3, 93.2e3, 216.0e3, 136.2e3];
  const xsp2 = [134.8e3, 143.7e3, 225.7e3, 93.1e3, 135.9e3, 152.0e3, 188.5e3];
  const xsp3 = [95.6e3, 98.6e3, 129.7e3, 94.2e3, 113.4e3, 122.7e3, 122.9e3];
  const C_D = [1.224, 0.801, 1.38, 1.0, 1.224, 1.518, 1.518];
  const z_D = [1.282, 2.161, 1.282, 20.0, 1.282, 1.282, 1.282];
  const bfm1 = [1.0, 1.0, 1.0, 1.0, 0.92, 1.0, 1.0];
  const bfm2 = [0.0, 0.0, 0.0, 0.0, 0.25, 0.0, 0.0];
  const bfm3 = [0.0, 0.0, 0.0, 0.0, 1.77, 0.0, 0.0];
  const bfp1 = [1.0, 0.93, 1.0, 0.93, 0.93, 1.0, 1.0];
  const bfp2 = [0.0, 0.31, 0.0, 0.19, 0.31, 0.0, 0.0];
  const bfp3 = [0.0, 2.0, 0.0, 1.79, 2.0, 0.0, 0.0];

  let z_T = inverseCCDF(time / 100);
  let z_L = inverseCCDF(location / 100);
  const z_S = inverseCCDF(situation / 100);
  const ci = climate - 1;
  const wn = f__mhz / 47.7;

  const d_ex__meter =
    Math.sqrt(2 * a_9000__meter * h_e__meter[0]) + Math.sqrt(2 * a_9000__meter * h_e__meter[1]) + Math.pow(575.7e12 / wn, THIRD);
  const d_e__meter = d__meter < d_ex__meter ? (130e3 * d__meter) / d_ex__meter : 130e3 + d__meter - d_ex__meter;

  let m = mdvar;
  const plus20 = m >= 20;
  if (plus20) m -= 20;
  const sigma_S = plus20 ? 0.0 : 5.0 + 3.0 * Math.exp(-d_e__meter / 100e3);
  const plus10 = m >= 10;
  if (plus10) m -= 10;

  const V_med__db = curve(all_year[0][ci], all_year[1][ci], all_year[2][ci], all_year[3][ci], all_year[4][ci], d_e__meter);

  if (m === Mdvar.SingleMessage) {
    z_T = z_S;
    z_L = z_S;
  } else if (m === Mdvar.Accidental) z_L = z_S;
  else if (m === Mdvar.Mobile) z_L = z_T;

  if (Math.abs(z_T) > 3.1 || Math.abs(z_L) > 3.1 || Math.abs(z_S) > 3.1) warnings |= WARN__EXTREME_VARIABILITIES;

  let sigma_L = 0.0;
  if (!plus10) {
    const delta_h_d__meter = terrainRoughness(d__meter, delta_h__meter);
    sigma_L = (10.0 * wn * delta_h_d__meter) / (wn * delta_h_d__meter + 13.0);
  }
  const Y_L = sigma_L * z_L;

  const q = Math.log(0.133 * wn);
  const g_minus = bfm1[ci] + bfm2[ci] / (Math.pow(bfm3[ci] * q, 2) + 1.0);
  const g_plus = bfp1[ci] + bfp2[ci] / (Math.pow(bfp3[ci] * q, 2) + 1.0);
  const sigma_T_minus = curve(bsm1[ci], bsm2[ci], xsm1[ci], xsm2[ci], xsm3[ci], d_e__meter) * g_minus;
  const sigma_T_plus = curve(bsp1[ci], bsp2[ci], xsp1[ci], xsp2[ci], xsp3[ci], d_e__meter) * g_plus;
  const sigma_TD = C_D[ci] * sigma_T_plus;
  const tgtd = (sigma_T_plus - sigma_TD) * z_D[ci];
  let sigma_T: number;
  if (z_T < 0.0) sigma_T = sigma_T_minus;
  else if (z_T <= z_D[ci]) sigma_T = sigma_T_plus;
  else sigma_T = sigma_TD + tgtd / z_T;
  const Y_T = sigma_T * z_T;

  const Y_S_temp =
    Math.pow(sigma_S, 2) + Math.pow(Y_T, 2) / (7.8 + Math.pow(z_S, 2)) + Math.pow(Y_L, 2) / (24.0 + Math.pow(z_S, 2));
  let Y_R: number, Y_S: number;
  if (m === Mdvar.SingleMessage) {
    Y_R = 0.0;
    Y_S = Math.sqrt(Math.pow(sigma_T, 2) + Math.pow(sigma_L, 2) + Y_S_temp) * z_S;
  } else if (m === Mdvar.Accidental) {
    Y_R = Y_T;
    Y_S = Math.sqrt(Math.pow(sigma_L, 2) + Y_S_temp) * z_S;
  } else if (m === Mdvar.Mobile) {
    Y_R = Math.sqrt(Math.pow(sigma_T, 2) + Math.pow(sigma_L, 2)) * z_T;
    Y_S = Math.sqrt(Y_S_temp) * z_S;
  } else {
    Y_R = Y_T + Y_L;
    Y_S = Math.sqrt(Y_S_temp) * z_S;
  }
  let result = A_ref__db - V_med__db - Y_R - Y_S;
  if (result < 0.0) result = (result * (29.0 - result)) / (29.0 - 10.0 * result);
  return { value: result, warnings };
}

// ---- itm_p2p.cpp: ITM_P2P_TLS_Ex ----
/** Basic transmission loss (dB) for a terrain profile. Throws ItmError on invalid input. */
export function itmP2P(input: ItmInput): ItmResult {
  let warnings = validateInputs(input);
  const { pfl, f__mhz } = input;
  const np = trunc(pfl[0]);
  const p10 = trunc(0.1 * np);
  let h_sys__meter = 0;
  for (let i = p10; i <= np - p10; i++) h_sys__meter += pfl[i + 2];
  h_sys__meter = h_sys__meter / (np - 2 * p10 + 1);

  const { Z_g, gamma_e, N_s } = initializePointToPoint(f__mhz, h_sys__meter, input.N_0, input.pol, input.epsilon, input.sigma);
  const h__meter: Pair = [input.h_tx__meter, input.h_rx__meter];
  const { theta_hzn, d_hzn__meter, h_e__meter, delta_h__meter, d__meter } = quickPfl(pfl, gamma_e, h__meter);

  const lr = longleyRice(theta_hzn, f__mhz, Z_g, d_hzn__meter, h_e__meter, gamma_e, N_s, delta_h__meter, h__meter, d__meter);
  warnings |= lr.warnings;
  const A_fs__db = freeSpaceLoss(d__meter, f__mhz);
  const v = variability(
    input.time,
    input.location,
    input.situation,
    h_e__meter,
    delta_h__meter,
    f__mhz,
    d__meter,
    lr.A_ref__db,
    input.climate,
    input.mdvar,
  );
  warnings |= v.warnings;

  return {
    A__db: v.value + A_fs__db,
    A_fs__db,
    A_ref__db: lr.A_ref__db,
    d__km: (pfl[0] * pfl[1]) / 1000,
    theta_hzn,
    d_hzn__meter,
    h_e__meter,
    N_s,
    delta_h__meter,
    mode: lr.propmode,
    warnings,
  };
}
