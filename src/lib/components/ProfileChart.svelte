<!--
  Canvas terrain profile: ground (earth-curvature corrected), line of sight, 60% Fresnel zone, obstacles.
  Hover/touch syncs a marker on the map through app.hover.
-->
<script lang="ts">
  import { app, current, geometry } from "../state.svelte.ts";

  let canvas: HTMLCanvasElement;
  let wrap: HTMLElement;
  let width = $state(360);
  const H = 220;
  const PAD = { l: 52, r: 22, t: 30, b: 40 };
  let info = $state("");

  $effect(() => {
    const ro = new ResizeObserver(([e]) => (width = e.contentRect.width || width)); // keep last width while hidden
    ro.observe(wrap);
    return () => ro.disconnect();
  });

  const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  $effect(() => {
    const c = current();
    const g = geometry();
    const hover = app.hover;
    if (!c || !g || !canvas) return;
    const dpr = devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, H);

    const pts = g.points;
    const dMax = pts.at(-1)!.d;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of pts) {
      lo = Math.min(lo, p.ground);
      hi = Math.max(hi, p.ground, p.los + p.fresnel * 0.6);
    }
    lo = Math.max(0, lo - 20);
    hi += (hi - lo) * 0.08;
    const X = (d: number) => PAD.l + (d / dMax) * (width - PAD.l - PAD.r);
    const Y = (h: number) => PAD.t + (1 - (h - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    const muted = cssVar("--muted");

    // grid + axes
    ctx.font = "10px Inter Variable, sans-serif";
    ctx.fillStyle = muted;
    ctx.strokeStyle = "hsl(200 30% 90% / 0.07)";
    for (let i = 0; i <= 4; i++) {
      const h = lo + ((hi - lo) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(PAD.l, Y(h));
      ctx.lineTo(width - PAD.r, Y(h));
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(`${Math.round(h)}`, PAD.l - 8, Y(h) + 3);
    }
    ctx.textAlign = "center";
    const step = dMax > 60e3 ? 20e3 : dMax > 20e3 ? 10e3 : dMax > 8e3 ? 2e3 : 1e3;
    for (let d = 0; d <= dMax; d += step)
      if (X(d) < width - PAD.r - 10 || d === 0) ctx.fillText(`${d / 1000}`, X(d), H - PAD.b + 16);
    ctx.textAlign = "right";
    ctx.fillText("jarak (km)", width - PAD.r, H - 8);
    ctx.textAlign = "left";
    ctx.fillText("ketinggian (mdpl)", 12, 16);

    // Fresnel zone (60%)
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(p.d), Y(p.los + 0.6 * p.fresnel)));
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(X(pts[i].d), Y(pts[i].los - 0.6 * pts[i].fresnel));
    ctx.fillStyle = "hsl(172 72% 48% / 0.12)";
    ctx.fill();

    // terrain
    const grad = ctx.createLinearGradient(0, PAD.t, 0, H);
    grad.addColorStop(0, "hsl(150 30% 38%)");
    grad.addColorStop(1, "hsl(150 25% 14%)");
    ctx.beginPath();
    ctx.moveTo(X(0), H - PAD.b);
    pts.forEach((p) => ctx.lineTo(X(p.d), Y(p.ground)));
    ctx.lineTo(X(dMax), H - PAD.b);
    ctx.fillStyle = grad;
    ctx.fill();

    // blocked segments in red
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = cssVar("--red");
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].clearance < 0 || pts[i - 1].clearance < 0) {
        ctx.beginPath();
        ctx.moveTo(X(pts[i - 1].d), Y(pts[i - 1].ground));
        ctx.lineTo(X(pts[i].d), Y(pts[i].ground));
        ctx.stroke();
      }
    }

    // straight signal line TX → antenna
    const m = c.byHeight[app.height - 1].margin_dB;
    ctx.strokeStyle = m >= 10 ? cssVar("--green") : m >= 0 ? cssVar("--amber") : cssVar("--red");
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(X(0), Y(pts[0].los));
    ctx.lineTo(X(dMax), Y(pts.at(-1)!.los));
    ctx.stroke();
    ctx.setLineDash([]);

    // towers
    const mast = (d: number, ground: number, top: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(X(d), Y(ground));
      ctx.lineTo(X(d), Y(top));
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(X(d), Y(top), 4, 0, Math.PI * 2);
      ctx.fill();
    };
    mast(0, pts[0].ground, pts[0].los, cssVar("--teal"));
    mast(dMax, pts.at(-1)!.ground, pts.at(-1)!.los, cssVar("--amber"));

    // obstruction markers
    ctx.fillStyle = cssVar("--red");
    ctx.font = "600 10px Inter Variable, sans-serif";
    for (const o of g.obstructions) {
      const p = pts[o.index];
      ctx.beginPath();
      ctx.arc(X(p.d), Y(p.ground), 4.5, 0, Math.PI * 2);
      ctx.fill();
      const label = `${Math.round(o.height)} m`;
      ctx.fillText(label, Math.min(X(p.d) + 6, width - 40), Y(p.ground) - 6);
    }

    // hover
    if (hover !== null && pts[hover]) {
      const p = pts[hover];
      ctx.strokeStyle = "hsl(0 0% 100% / 0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(p.d), PAD.t);
      ctx.lineTo(X(p.d), H - PAD.b);
      ctx.stroke();
    }
  });

  function onPointer(e: PointerEvent) {
    const c = current();
    const g = geometry();
    if (!c || !g) return;
    const r = canvas.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left - PAD.l) / (r.width - PAD.l - PAD.r)));
    const i = Math.round(t * c.pfl[0]);
    app.hover = i;
    const p = g.points[i];
    const dHome = (g.points.at(-1)!.d - p.d) / 1000;
    info = `${(p.d / 1000).toFixed(1)} km dari pemancar (${dHome.toFixed(1)} km dari rumah) · tanah ${Math.round(c.pfl[2 + i])} mdpl · ${p.clearance >= 0 ? `bebas ${Math.round(p.clearance)} m` : `terhalang ${Math.round(-p.clearance)} m`}`;
  }
  const onLeave = () => {
    app.hover = null;
    info = "";
  };
</script>

<figure class="chart" bind:this={wrap}>
  <canvas
    bind:this={canvas}
    style="width:100%;height:{H}px"
    onpointermove={onPointer}
    onpointerdown={onPointer}
    onpointerleave={onLeave}
    aria-label="Profil ketinggian jalur dari pemancar ke rumah. Garis putus-putus adalah jalur sinyal lurus; titik merah adalah penghalang."
  ></canvas>
  <figcaption class="muted" aria-live="polite">
    {info || "Geser jari di grafik untuk melihat ketinggian & halangan di tiap titik."}
  </figcaption>
</figure>

<style>
  .chart {
    margin: 0;
    touch-action: pan-y;
  }
  canvas {
    display: block;
    border-radius: 12px;
    background: var(--inset);
  }
  figcaption {
    font-size: 0.75rem;
    min-height: 2.4em;
    margin-top: 6px;
  }
</style>
