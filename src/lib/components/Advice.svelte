<!--
  Recommendation card for the selected transmitter: antenna type, Yagi dimensions, or satellite dish fallback.
-->
<script lang="ts">
  import { advice } from "../state.svelte.ts";
  import { compassLabel } from "../core/geo.ts";

  const a = $derived(advice());
  const icon = { indoor: "📶", outdoor: "📡", "high-gain": "📡", "tall-mast": "🗼", satellite: "🛰️" };
</script>

{#if a}
  <section class="advice glass" aria-labelledby="advice-title">
    <h3 id="advice-title"><span aria-hidden="true">{icon[a.kind]}</span> {a.title}</h3>
    <p>{a.detail}</p>

    {#if a.yagi}
      {@const y = a.yagi}
      {@const max = Math.max(...y.elements.map((e) => e.length_cm))}
      <details>
        <summary>Ukuran antena Yagi {y.elements.length} elemen untuk {y.f__mhz} MHz (±{y.gain_dBi} dBi)</summary>
        <svg viewBox="-10 -{max / 2 + 12} {y.boom_cm + 20} {max + 24}" role="img" aria-label="Diagram antena Yagi tampak atas">
          <line x1="0" y1="0" x2={y.boom_cm} y2="0" stroke="var(--muted)" stroke-width="2" />
          {#each y.elements as e, i (e.name)}
            <line
              x1={e.position_cm}
              x2={e.position_cm}
              y1={-e.length_cm / 2}
              y2={e.length_cm / 2}
              stroke={i === 1 ? "var(--amber)" : "var(--teal)"}
              stroke-width="2"
              stroke-linecap="round"
            />
          {/each}
          <text x={y.boom_cm} y={max / 2 + 10} fill="var(--muted)" font-size="6" text-anchor="end">→ arahkan ke pemancar</text>
        </svg>
        <table>
          <thead><tr><th>Elemen</th><th>Panjang</th><th>Posisi di boom</th></tr></thead>
          <tbody>
            {#each y.elements as e (e.name)}<tr><td>{e.name}</td><td>{e.length_cm} cm</td><td>{e.position_cm} cm</td></tr>{/each}
          </tbody>
        </table>
        <p class="muted small">Desain DL6WU, elemen batang Ø ±4 mm, boom non-logam. Panjang boom ±{y.boom_cm} cm.</p>
      </details>
    {/if}

    {#if a.satellite}
      <ul class="sats">
        {#each a.satellite as s (s.name)}
          <li>
            <strong>{s.name}</strong> <span class="muted">({s.lon}°BT)</span><br />
            Arah {Math.round(s.azimuth)}° {compassLabel(s.azimuth)} · elevasi {Math.round(s.elevation)}°
          </li>
        {/each}
      </ul>
      <p class="muted small">
        Parabola C-band (Ø ≥ 1,8 m) untuk Telkom-4; Ku-band (Ø 60–90 cm) untuk satelit Ku. Ikuti panduan decoder/penyedia layanan.
      </p>
    {/if}
  </section>
{/if}

<style>
  .advice {
    padding: 16px;
    animation: fade-up 0.4s var(--ease) 0.1s both;
  }
  h3 {
    font-size: 1.05rem;
  }
  p {
    margin: 6px 0 0;
    font-size: 0.9rem;
    line-height: 1.5;
  }
  details {
    margin-top: 12px;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
    min-height: 44px;
    display: flex;
    align-items: center;
    color: var(--teal);
  }
  svg {
    width: 100%;
    max-height: 160px;
    margin: 6px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    text-align: left;
    padding: 5px 4px;
    border-bottom: 1px solid var(--line);
  }
  th {
    color: var(--muted);
    font-weight: 500;
  }
  .sats {
    margin: 10px 0 0;
    padding-left: 18px;
    font-size: 0.88rem;
    line-height: 1.5;
  }
  .small {
    font-size: 0.75rem;
  }
</style>
