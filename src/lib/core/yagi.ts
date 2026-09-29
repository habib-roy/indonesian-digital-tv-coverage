/**
 * Yagi-Uda dimensions after DL6WU long-Yagi design (G. Hoch, "More Gain with Yagi Antennas",
 * VHF Communications 4/1977; widely reproduced tables).
 * ponytail: element lengths use the DL6WU table for a thin-rod (d/λ ≈ 0.0063) non-conductive boom;
 * metal-boom correction is not applied. Good for DIY TV reception, not for precision work.
 */

const C = 299_792_458;

/** Director lengths (λ) — DL6WU, d/λ = 0.0063, no boom correction. */
const DIRECTORS = [0.44, 0.43, 0.42, 0.415, 0.41, 0.405, 0.4, 0.398, 0.396, 0.394, 0.392, 0.39, 0.388];
/** Spacing from previous element (λ): reflector→DE 0.2, DE→D1 0.075, then growing to 0.4. */
const SPACING = [0.2, 0.075, 0.18, 0.215, 0.25, 0.28, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375, 0.39, 0.4];

export interface YagiElement {
  name: string;
  length_cm: number;
  position_cm: number;
}

export interface YagiDesign {
  f__mhz: number;
  elements: YagiElement[];
  boom_cm: number;
  gain_dBi: number;
}

/**
 * Approximate gain (dBi) from boom length: ≈11 dBi at 1λ, +3 dB per doubling (DL6WU/published long-Yagi
 * curves), floor 7 dBi for short 3-element antennas. Accuracy ±1 dB.
 */
export const yagiGain = (n: number): number => {
  const boomλ = SPACING.slice(0, n - 1).reduce((a, b) => a + b, 0);
  return Math.max(7, 11 + 10 * Math.log10(boomλ));
};

export function designYagi(f__mhz: number, elements: number): YagiDesign {
  const n = Math.max(3, Math.min(15, Math.round(elements)));
  const λ = (C / (f__mhz * 1e6)) * 100; // cm
  const lengths = [0.482, 0.47, ...DIRECTORS.slice(0, n - 2)];
  const names = ["Reflektor", "Driven (dipol)", ...Array.from({ length: n - 2 }, (_, i) => `Direktor ${i + 1}`)];
  let pos = 0;
  const els = lengths.map((l, i) => {
    if (i > 0) pos += SPACING[i - 1] * λ;
    return { name: names[i], length_cm: +(l * λ).toFixed(1), position_cm: +pos.toFixed(1) };
  });
  return { f__mhz, elements: els, boom_cm: +(pos + 5).toFixed(0), gain_dBi: +yagiGain(n).toFixed(1) };
}

/** Smallest element count whose gain covers `needGain_dBi`, or null if > 15 elements. */
export function elementsForGain(needGain_dBi: number): number | null {
  for (let n = 3; n <= 15; n++) if (yagiGain(n) >= needGain_dBi) return n;
  return null;
}
