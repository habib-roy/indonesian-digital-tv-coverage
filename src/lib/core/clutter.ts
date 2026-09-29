/**
 * Knife-edge diffraction J(ν) — ITU-R P.526 eq. (31). Shared by Fresnel analysis and P.2108.
 * Valid for ν > −0.78; returns 0 below.
 */
export function knifeEdgeLoss(nu: number): number {
  if (nu <= -0.78) return 0;
  return 6.9 + 20 * Math.log10(Math.sqrt((nu - 0.1) ** 2 + 1) + nu - 0.1);
}

/** ESA WorldCover v200 class codes. */
export const WORLDCOVER = {
  10: "Pepohonan / hutan",
  20: "Semak",
  30: "Padang rumput",
  40: "Lahan pertanian",
  50: "Permukiman / bangunan",
  60: "Lahan terbuka",
  70: "Salju & es",
  80: "Perairan",
  90: "Lahan basah",
  95: "Mangrove",
  100: "Lumut & lichen",
} as const;
export type WorldCoverClass = keyof typeof WORLDCOVER;

export type ClutterCategory = "water" | "open" | "suburban" | "urban" | "trees";

/**
 * ITU-R P.2108-1 Table 3 nominal clutter height R and street width ws (m).
 * `dense urban` (R=20) is not used: WorldCover cannot tell dense from normal built-up.
 */
const CLUTTER: Record<ClutterCategory, { R: number; ws: number; method: "height-gain" | "diffraction" }> = {
  water: { R: 10, ws: 20, method: "height-gain" },
  open: { R: 10, ws: 20, method: "height-gain" },
  suburban: { R: 10, ws: 20, method: "diffraction" },
  urban: { R: 15, ws: 20, method: "diffraction" },
  trees: { R: 15, ws: 20, method: "diffraction" },
};

/**
 * WorldCover → P.2108 category.
 * ponytail: built-up (50) maps to "urban" everywhere; Indonesian kampung is often 1–2 storey (closer to
 * suburban). Upgrade when a building-height layer is free for Indonesia.
 */
export function clutterCategory(c: number): ClutterCategory {
  if (c === 50) return "urban";
  if (c === 10 || c === 95) return "trees";
  if (c === 80 || c === 90) return "water";
  return "open";
}

export const clutterHeight = (cat: ClutterCategory): number => CLUTTER[cat].R;

/**
 * ITU-R P.2108-1 §3.1 terminal clutter loss (dB) for antenna height h (m) at f (MHz).
 * The path model must be evaluated with the terminal at height max(h, R); this adds the loss for h < R.
 */
export function terminalClutterLoss(h: number, f__mhz: number, cat: ClutterCategory): number {
  const { R, ws, method } = CLUTTER[cat];
  if (h >= R) return 0;
  const fGHz = f__mhz / 1000;
  if (method === "height-gain") {
    const Kh2 = 21.8 + 6.2 * Math.log10(fGHz);
    return -Kh2 * Math.log10(h / R);
  }
  const hdif = R - h;
  const θclut = (Math.atan(hdif / ws) * 180) / Math.PI;
  const Knu = 0.342 * Math.sqrt(fGHz);
  const nu = Knu * Math.sqrt(hdif * θclut);
  return knifeEdgeLoss(nu) - 6.03;
}
