<!--
  Signal verdict for the selected transmitter + transmitter dropdown (all candidates, strongest first).
-->
<script lang="ts">
  import { app, areaById, geometry } from "../state.svelte.ts";
  import { compassLabel } from "../core/geo.ts";
  import { WORLDCOVER } from "../core/clutter.ts";

  const a = $derived(app.analysis!);
  const c = $derived(a.results[app.selected]);
  const r = $derived(c.byHeight[app.height - 1]);
  const g = $derived(geometry());
  const status = $derived(r.margin_dB >= 10 ? "good" : r.margin_dB >= 0 ? "ok" : "bad");
  const label = { good: "Sinyal kuat", ok: "Sinyal cukup", bad: "Sinyal lemah" };
  // bar: −30 dB … +30 dB margin
  const pct = $derived(Math.max(3, Math.min(100, ((r.margin_dB + 30) / 60) * 100)));
  const estimated = $derived(Object.values(c.tx.confidence).some((v) => v === "estimated" || v === "area-center"));
</script>

{#if a.results.length > 1}
  <label class="tx-pick">
    <span>Pemancar ({a.results.length} dalam jangkauan, urut sinyal terkuat)</span>
    <select id="tx-select" bind:value={app.selected}>
      {#each a.results as t, i (t.tx.id)}
        {@const m = t.byHeight[app.height - 1].margin_dB}
        <option value={i}
          >{m >= 10 ? "🟢" : m >= 0 ? "🟡" : "🔴"}
          {t.tx.name} · {(t.distanceM / 1000).toFixed(0)} km · {m >= 0 ? "+" : ""}{m.toFixed(0)} dB</option
        >
      {/each}
    </select>
  </label>
{/if}

<article class="card {status}" aria-labelledby="result-title">
  <header>
    <div>
      <h2 id="result-title">{label[status]}</h2>
      <p class="muted">{c.tx.name} · {areaById.get(c.tx.area)?.name ?? ""}</p>
    </div>
    <div class="margin">
      <strong>{r.margin_dB >= 0 ? "+" : ""}{r.margin_dB.toFixed(1)}</strong><small>dB</small>
    </div>
  </header>

  <div class="bar" aria-hidden="true"><span style="width:{pct}%"></span><i></i></div>
  <p class="bar-legend muted">
    <span>Kuat medan {r.field_dBuV.toFixed(1)} dBµV/m</span><span>butuh ≥ {r.threshold_dBuV.toFixed(1)}</span>
  </p>

  <dl>
    <div>
      <dt>Jarak</dt>
      <dd>{(c.distanceM / 1000).toFixed(1)} km</dd>
    </div>
    <div>
      <dt>Arah antena</dt>
      <dd>
        <span class="compass" style="--b:{c.bearing}deg" aria-hidden="true">➤</span>
        {Math.round(c.bearing)}° {compassLabel(c.bearing)}
      </dd>
    </div>
    <div>
      <dt>Frekuensi</dt>
      <dd>{c.tx.freq_mhz} MHz</dd>
    </div>
    <div>
      <dt>Lingkungan</dt>
      <dd>{WORLDCOVER[app.landcover as keyof typeof WORLDCOVER] ?? "—"}</dd>
    </div>
  </dl>

  <div class="badges">
    {#if g?.los}<span class="badge">Garis pandang bebas</span>{:else}<span class="badge bad"
        >Terhalang {g?.obstructions.length ?? 0} titik</span
      >{/if}
    <span class="badge">{r.mode === "los" ? "Mode LOS" : r.mode === "diffraction" ? "Mode difraksi" : "Troposcatter"}</span>
    {#if estimated}<span class="badge warn" title="Tinggi menara / daya pancar belum terverifikasi">Data pemancar estimasi</span
      >{/if}
    {#if c.minHeight && c.minHeight > app.height}<span class="badge warn">Cukup mulai {c.minHeight} m</span>{/if}
  </div>
</article>

<style>
  .tx-pick {
    display: grid;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  select {
    min-height: 44px;
    padding: 0 12px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--inset);
    color: var(--text);
    font: inherit;
    font-size: 16px;
    width: 100%;
  }
  .good {
    --c: var(--green);
  }
  .ok {
    --c: var(--amber);
  }
  .bad {
    --c: var(--red);
  }
  .card {
    padding: 16px;
    border-radius: var(--radius);
    background: linear-gradient(160deg, color-mix(in hsl, var(--c) 14%, transparent), var(--inset) 60%);
    border: 1px solid color-mix(in hsl, var(--c) 30%, transparent);
    animation: fade-up 0.4s var(--ease);
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  h2 {
    font-size: 1.35rem;
    color: var(--c);
  }
  header p {
    margin: 2px 0 0;
    font-size: 0.8rem;
  }
  .margin {
    text-align: right;
    font-family: var(--display);
  }
  .margin strong {
    font-size: 2rem;
    line-height: 1;
    color: var(--c);
    font-variant-numeric: tabular-nums;
  }
  .margin small {
    margin-left: 2px;
    color: var(--muted);
  }
  .bar {
    position: relative;
    height: 10px;
    margin-top: 14px;
    border-radius: 5px;
    background: var(--track);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--c);
    transition: width 0.4s var(--ease);
  }
  .bar i {
    position: absolute;
    left: 50%;
    top: -2px;
    bottom: -2px;
    width: 2px;
    background: #fff;
  }
  .bar-legend {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
    margin: 6px 0 0;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 14px 0 0;
  }
  dt {
    font-size: 0.72rem;
    color: var(--muted);
  }
  dd {
    margin: 2px 0 0;
    font-weight: 600;
  }
  .compass {
    display: inline-block;
    transform: rotate(calc(var(--b) - 90deg));
    color: var(--teal);
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 14px;
  }
</style>
