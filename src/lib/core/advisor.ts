/** Rule-based reception advice. Margins are relative to the reference 10 dBi rooftop Yagi (propagation.ts). */
import { RECEIVER } from "./propagation.ts";
import { elementsForGain, designYagi, type YagiDesign } from "./yagi.ts";
import { geostationaryLook, type LatLon } from "./geo.ts";

export type AdviceKind = "indoor" | "outdoor" | "high-gain" | "tall-mast" | "satellite";

export interface Advice {
  kind: AdviceKind;
  title: string;
  detail: string;
  minHeight?: number;
  yagi?: YagiDesign;
  satellite?: { name: string; lon: number; azimuth: number; elevation: number }[];
}

/** Generic satellites commonly used for free-to-air TV in Indonesia (contributors may extend). */
export const SATELLITES = [
  { name: "Telkom-4 (Merah Putih)", lon: 108.0, band: "C" },
  { name: "ChinaSat 11", lon: 98.0, band: "Ku" },
  { name: "SES-9", lon: 108.2, band: "Ku" },
];

const LNA_GAIN_dB = 3; // realistic effective improvement from a mast-head LNA on a noisy feeder

export interface AdviceInput {
  home: LatLon;
  f__mhz: number;
  margin_dB: number; // at current antenna height
  heightNow: number;
  minHeight: number | null; // for margin ≥ 0 with reference Yagi
  obstruction?: { km: number; height: number; bearing: number };
}

export function advise(i: AdviceInput): Advice {
  const m = i.margin_dB;
  if (m >= 10)
    return {
      kind: "indoor",
      title: "Sinyal kuat",
      detail: "Antena indoor atau antena outdoor kecil sudah cukup. Arahkan ke pemancar.",
    };
  if (m >= 0)
    return {
      kind: "outdoor",
      title: "Pakai antena luar (Yagi)",
      detail: `Pasang antena Yagi di atap setinggi ${i.heightNow} m, arahkan tepat ke pemancar.`,
    };
  const needGain = RECEIVER.antennaGain_dBi - m;
  const n = elementsForGain(needGain - LNA_GAIN_dB);
  if (n)
    return {
      kind: "high-gain",
      title: "Antena gain tinggi + booster",
      detail: `Kurang ${(-m).toFixed(1)} dB. Pakai Yagi ${n} elemen (bisa dibuat sendiri) dan booster/LNA di tiang.`,
      yagi: designYagi(i.f__mhz, n),
    };
  if (i.minHeight !== null && i.minHeight > i.heightNow)
    return {
      kind: "tall-mast",
      title: `Naikkan antena ke ${i.minHeight} m`,
      detail:
        i.minHeight > 15
          ? `Butuh tiang ${i.minHeight} m — mahal & berisiko. Pastikan tiang dibumikan (grounding) dan diberi tali pengikat; jauhkan dari kabel listrik.`
          : `Dengan tiang ${i.minHeight} m sinyal diperkirakan cukup.`,
      minHeight: i.minHeight,
    };
  const why = i.obstruction
    ? `Terhalang punggung bukit ±${Math.round(i.obstruction.height)} mdpl di km ${i.obstruction.km.toFixed(1)} arah ${Math.round(i.obstruction.bearing)}°.`
    : "Sinyal terlalu lemah meski antena dinaikkan sampai 30 m.";
  return {
    kind: "satellite",
    title: "Gunakan parabola satelit",
    detail: `${why} TV digital terestrial kemungkinan tidak bisa diterima; parabola satelit adalah solusi yang realistis.`,
    satellite: SATELLITES.map((s) => ({ name: s.name, lon: s.lon, ...geostationaryLook(i.home, s.lon) })),
  };
}
