/**
 * Field strength & margin for one transmitter → home path.
 * Model: ITM point-to-point (NTIA) + ITU-R P.2108 §3.1 terminal clutter at the home.
 */
import { itmP2P } from "./itm.ts";
import { terminalClutterLoss, clutterHeight, type ClutterCategory } from "./clutter.ts";

/**
 * ITM settings. Variability follows FCC OET-69 DTV practice: F(50,90) — 50% locations, 90% time,
 * 50% confidence, broadcast mode (mdvar 3).
 */
export const ITM_PARAMS = {
  climate: 1, // equatorial
  N_0: 350, // sea-level refractivity, ITU-R P.453 maps for the Indonesian archipelago
  pol: 0, // horizontal (DVB-T2 in Indonesia)
  epsilon: 15, // average ground
  sigma: 0.005,
  mdvar: 3,
  time: 90,
  location: 50,
  situation: 50,
} as const;

/**
 * Receiver reference: outdoor Yagi on the roof.
 * Transmission mode = Indonesian DVB-T2 (Permenkominfo 3/2019, TVRI "Jangkauan Siaran TV Digital" 2024):
 *   64-QAM, FEC 4/5, FFT 32k extended, GI 1/16, PP4, ~33 Mbps in 8 MHz.
 * Threshold from first principles:
 *   noise = −174 dBm/Hz + 10·log10(7.77 MHz, 32k extended occupied BW) + NF 6 dB ≈ −99.1 dBm
 *   C/N 20 dB — 64-QAM 4/5 has the same 4.8 bit/cell as 256-QAM 3/5 (≈ 17.1 dB Rice, ETSI TR 102 831 Table 45),
 *   so ≈ 17 dB + 3 dB implementation margin. ponytail: exact 64-QAM 4/5 table value not checked.
 *   → P_min ≈ −79.1 dBm at the tuner.
 */
export const RECEIVER = {
  noiseFigure_dB: 6,
  bandwidth_Hz: 7.77e6,
  cn_dB: 20,
  antennaGain_dBi: 10,
  feederLoss_dB: 3,
};

export const minPower_dBm = (): number =>
  -174 + 10 * Math.log10(RECEIVER.bandwidth_Hz) + RECEIVER.noiseFigure_dB + RECEIVER.cn_dB;

/** Minimum field strength (dBµV/m) at the antenna for the reference receiver. */
export function minField_dBuV(f__mhz: number, gain_dBi = RECEIVER.antennaGain_dBi): number {
  // E = P_rx(dBm) − G(dBi) + L_feeder + 20·log10 f(MHz) + 77.2
  return minPower_dBm() - gain_dBi + RECEIVER.feederLoss_dB + 20 * Math.log10(f__mhz) + 77.2;
}

/** E (dBµV/m) = EIRP(dBW) − L_b + 20·log10 f(MHz) + 107.2   (ITU-R P.525) */
export function fieldStrength(erp_kw: number, basicLoss_dB: number, f__mhz: number): number {
  const eirp_dBW = 10 * Math.log10(erp_kw * 1000) + 2.15;
  return eirp_dBW - basicLoss_dB + 20 * Math.log10(f__mhz) + 107.2;
}

export interface LinkInput {
  pfl: number[]; // TX → RX profile
  txHeight: number;
  rxHeight: number;
  erp_kw: number;
  f__mhz: number;
  clutter: ClutterCategory;
}

export interface LinkResult {
  itmLoss: number;
  clutterLoss: number;
  field_dBuV: number;
  threshold_dBuV: number;
  margin_dB: number;
  mode: "los" | "diffraction" | "troposcatter";
}

const MODES = ["los", "los", "diffraction", "troposcatter"] as const;

export function link(i: LinkInput): LinkResult {
  // P.2108: evaluate the path at clutter height, then add terminal loss for the part below it.
  const hPath = Math.max(i.rxHeight, clutterHeight(i.clutter));
  const r = itmP2P({ ...ITM_PARAMS, h_tx__meter: i.txHeight, h_rx__meter: hPath, pfl: i.pfl, f__mhz: i.f__mhz });
  const clutterLoss = terminalClutterLoss(i.rxHeight, i.f__mhz, i.clutter);
  const field_dBuV = fieldStrength(i.erp_kw, r.A__db + clutterLoss, i.f__mhz);
  const threshold_dBuV = minField_dBuV(i.f__mhz);
  return {
    itmLoss: r.A__db,
    clutterLoss,
    field_dBuV,
    threshold_dBuV,
    margin_dB: field_dBuV - threshold_dBuV,
    mode: MODES[r.mode] ?? "diffraction",
  };
}

/** Lowest antenna height (1..maxH, step 1 m) with margin ≥ `need` dB, or null. */
export function minHeightForSignal(i: Omit<LinkInput, "rxHeight">, need = 0, maxH = 30): number | null {
  for (let h = 1; h <= maxH; h++) if (link({ ...i, rxHeight: h }).margin_dB >= need) return h;
  return null;
}
