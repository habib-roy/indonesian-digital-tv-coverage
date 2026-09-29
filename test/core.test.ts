import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceM, bearingDeg, geostationaryLook, compassLabel } from "../src/lib/core/geo.ts";
import { freeSpaceLoss, fresnelRadius, earthBulge, analysePath } from "../src/lib/core/fresnel.ts";
import { knifeEdgeLoss, terminalClutterLoss } from "../src/lib/core/clutter.ts";
import { decodeTerrarium, Terrain } from "../src/lib/core/terrain.ts";
import { minField_dBuV, fieldStrength, link, minHeightForSignal } from "../src/lib/core/propagation.ts";
import { designYagi, yagiGain } from "../src/lib/core/yagi.ts";
import { advise } from "../src/lib/core/advisor.ts";
import { validateData, uhfToMhz, type Transmitter } from "../src/lib/core/data.ts";

const near = (a: number, b: number, tol: number, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≉ ${b} ±${tol}`);

test("geo: distance & bearing", () => {
  near(distanceM({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }), 111_195, 10);
  near(bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 0, 1e-9);
  near(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }), 90, 1e-9);
  assert.equal(compassLabel(225), "Barat Daya");
});

test("geo: dish from Jakarta to 108°E ≈ 83° elevation, north-east-ish", () => {
  const { azimuth, elevation } = geostationaryLook({ lat: -6.2, lon: 106.8 }, 108);
  near(elevation, 83, 1);
  assert.ok(azimuth > 0 && azimuth < 90, `az ${azimuth}`);
});

test("fresnel: FSPL, Fresnel radius, earth bulge", () => {
  near(freeSpaceLoss(10_000, 500), 106.4, 0.1);
  near(fresnelRadius(5000, 10_000, 500), 38.7, 0.1); // √(λ·d1·d2/d), λ=0.6 m
  near(fresnelRadius(500, 1000, 500), 12.2, 0.1);
  near(earthBulge(25_000, 50_000), 36.8, 0.1);
});

test("clutter: J(0) = 6.0 dB; P.2108 zero above clutter, positive below", () => {
  near(knifeEdgeLoss(0), 6.0, 0.05);
  assert.equal(terminalClutterLoss(20, 600, "urban"), 0);
  const u = terminalClutterLoss(5, 600, "urban");
  assert.ok(u > 5 && u < 25, `urban ${u}`);
  near(terminalClutterLoss(10, 600, "open"), 0, 1e-9);
});

test("terrain: Terrarium decode & bilinear sampling with fake loader", async () => {
  assert.equal(decodeTerrarium(128, 0, 0), 0);
  assert.equal(decodeTerrarium(128, 100, 128), 100.5);
  const t = new Terrain(async () => new Float32Array(256 * 256).fill(42));
  const pts = Terrain.pathPoints({ lat: -6.2, lon: 106.8 }, { lat: -6.3, lon: 106.9 });
  assert.throws(() => t.elevation(pts[0]), /not prefetched/);
  await t.prefetch(pts);
  near(t.elevation(pts[0]), 42, 1e-9);
  const pfl = t.profile(pts);
  assert.equal(pfl.length, pfl[0] + 3);
});

test("propagation: threshold & field strength sanity", () => {
  // Reference receiver → roughly 45–50 dBµV/m in UHF, same ballpark as ITU/EBU rooftop planning values.
  const t = minField_dBuV(600);
  assert.ok(t > 40 && t < 55, `threshold ${t}`);
  // Free space, 1 kW ERP: E = 106.9 + 10·log(ERP kW) − 20·log(d km)  →  10 km = 86.9 dBµV/m (ITU-R P.525)
  near(fieldStrength(1, freeSpaceLoss(10_000, 500), 500), 86.9, 0.2);
});

const flat = (n: number, dx: number, h = 10) => [n, dx, ...Array(n + 1).fill(h)];
const ridge = (n: number, dx: number, peak: number) => [
  n,
  dx,
  ...Array.from({ length: n + 1 }, (_, i) => (i === Math.round(n * 0.7) ? peak : 10)),
];

test("propagation: close flat path has strong margin; ridge kills it; height helps", () => {
  const base = { txHeight: 150, erp_kw: 10, f__mhz: 600, clutter: "suburban" as const };
  const good = link({ ...base, pfl: flat(200, 100), rxHeight: 10 });
  assert.ok(good.margin_dB > 10, `good ${good.margin_dB}`);
  const bad = link({ ...base, pfl: ridge(400, 150, 900), rxHeight: 10 });
  assert.ok(bad.margin_dB < good.margin_dB - 30, `bad ${bad.margin_dB}`);
  const h = minHeightForSignal({ ...base, pfl: flat(600, 100) }, 0);
  assert.ok(h === null || (h >= 1 && h <= 30));
});

test("fresnel: analysePath finds the ridge", () => {
  const g = analysePath(ridge(100, 100, 500), 50, 10, 600);
  assert.equal(g.los, false);
  assert.equal(g.obstructions[0].index, 70);
  assert.ok(analysePath(flat(100, 100), 100, 30, 600).los);
});

test("yagi: DL6WU dimensions @ 498 MHz", () => {
  const y = designYagi(498, 10);
  assert.equal(y.elements.length, 10);
  near(y.elements[1].length_cm, 28.3, 0.2); // 0.47λ, λ=60.2 cm
  assert.ok(yagiGain(10) > yagiGain(5));
});

test("advisor: blocked → satellite; +15 dB → indoor", () => {
  const home = { lat: -6.9, lon: 107.6 };
  assert.equal(advise({ home, f__mhz: 600, margin_dB: 15, heightNow: 10, minHeight: 1 }).kind, "indoor");
  const s = advise({
    home,
    f__mhz: 600,
    margin_dB: -60,
    heightNow: 10,
    minHeight: null,
    obstruction: { km: 14, height: 820, bearing: 245 },
  });
  assert.equal(s.kind, "satellite");
  assert.match(s.detail, /km 14\.0 arah 245°/);
  assert.ok(s.satellite!.every((x) => x.elevation > 60));
});

test("data: UHF raster & validator", () => {
  assert.equal(uhfToMhz(21), 474);
  assert.equal(uhfToMhz(45), 666);
  const area = { id: "a", name: "A", regencies: "", uhf: [30], aso: true, source: "https://x.y" };
  const tx: Transmitter = {
    id: "t",
    name: "T",
    area: "a",
    lat: -6,
    lon: 106,
    height_m: 100,
    erp_kw: 5,
    freq_mhz: 546,
    confidence: { location: "osm", height: "estimated", erp: "estimated" },
    source: ["https://osm.org"],
  };
  assert.deepEqual(validateData([area], [tx]), []);
  assert.equal(validateData([area], [{ ...tx, lat: 40, freq_mhz: 550, source: [] }]).length, 3);
});
