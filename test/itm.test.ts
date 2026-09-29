import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { itmP2P } from "../src/lib/core/itm.ts";

const fx = (f: string) => new URL(`./fixtures/${f}`, import.meta.url);

// Same synthetic profiles as test/fixtures/itm-reference-gen.cpp
function profile(kind: number, np: number, xi: number): number[] {
  const p = [np, xi];
  for (let i = 0; i <= np; i++) {
    const t = i / np;
    let h: number;
    if (kind === 0) h = 10;
    else if (kind === 1) h = 20 + 300 * Math.exp(-(((t - 0.5) / 0.08) ** 2));
    else if (kind === 2) h = 100 + 400 * Math.abs(Math.sin(t * 9.0)) + 50 * Math.sin(t * 37);
    else if (kind === 3) h = 5 + 40 * Math.sin(t * 3.0);
    else h = 800 - 700 * t + 900 * Math.exp(-(((t - 0.8) / 0.03) ** 2));
    p.push(h);
  }
  return p;
}

test("ITM matches NTIA published example (cmd_examples/o_p2ptls.txt)", () => {
  const pfl = readFileSync(fx("itm-ntia-pfl.txt"), "utf8").split(",").map(Number);
  const r = itmP2P({
    h_tx__meter: 15,
    h_rx__meter: 3,
    pfl,
    climate: 5,
    N_0: 301,
    f__mhz: 3500,
    pol: 1,
    epsilon: 15,
    sigma: 0.005,
    mdvar: 1,
    time: 50,
    location: 50,
    situation: 50,
  });
  assert.equal(r.A__db.toFixed(1), "114.5");
  assert.equal(r.d__km.toFixed(3), "3.635");
  assert.equal(r.N_s.toFixed(1), "251.5");
  assert.equal(r.delta_h__meter.toFixed(1), "3.2");
  assert.equal(r.mode, 1);
});

interface Ref {
  kind: number;
  np: number;
  xi: number;
  htx: number;
  hrx: number;
  f: number;
  climate: number;
  pol: number;
  mdvar: number;
  t: number;
  l: number;
  s: number;
  A: number;
  mode: number;
  warn: number;
  dh: number;
}

const refs = JSON.parse(readFileSync(fx("itm-reference.json"), "utf8")) as Ref[];

for (const [i, c] of refs.entries()) {
  test(`ITM matches compiled NTIA C++ — case ${i} (mode ${c.mode})`, () => {
    const r = itmP2P({
      h_tx__meter: c.htx,
      h_rx__meter: c.hrx,
      pfl: profile(c.kind, c.np, c.xi),
      climate: c.climate,
      N_0: 301,
      f__mhz: c.f,
      pol: c.pol,
      epsilon: 15,
      sigma: 0.005,
      mdvar: c.mdvar,
      time: c.t,
      location: c.l,
      situation: c.s,
    });
    assert.ok(Math.abs(r.A__db - c.A) < 0.01, `A ${r.A__db} vs ${c.A}`);
    assert.ok(Math.abs(r.delta_h__meter - c.dh) < 0.01, `dh ${r.delta_h__meter} vs ${c.dh}`);
    assert.equal(r.mode, c.mode);
    assert.equal(r.warnings, c.warn);
  });
}
