<!--
  App shell: map + 3-step wizard (Lokasi → Analisis → Hasil), modals, and print layout.
  Printing shows every result section; on screen only the current step is visible.
-->
<script lang="ts">
  import MapView from "./lib/components/Map.svelte";
  import SearchBox from "./lib/components/SearchBox.svelte";
  import BottomSheet from "./lib/components/BottomSheet.svelte";
  import LoadingStepper from "./lib/components/LoadingStepper.svelte";
  import ResultCard from "./lib/components/ResultCard.svelte";
  import ProfileChart from "./lib/components/ProfileChart.svelte";
  import HeightSlider from "./lib/components/HeightSlider.svelte";
  import Advice from "./lib/components/Advice.svelte";
  import Modal from "./lib/components/Modal.svelte";
  import Welcome from "./lib/components/Welcome.svelte";
  import { app } from "./lib/state.svelte.ts";
  import { markdown } from "./lib/core/markdown.ts";
  import metode from "../docs/metode.md?raw";

  import { REPO_URL as REPO } from "./config.ts";
  let mapView: MapView;
  let methods: Modal;
  let contrib: Modal;
  let privacy: Modal;
  const busy = $derived(app.steps.some((s) => s === "active"));

  // Wizard: 1 lokasi → 2 analisis → 3 hasil (antena, saran, cetak)
  const WIZARD = ["Lokasi", "Analisis", "Hasil"];
  let step = $state(1);
  const ready = $derived(!!app.analysis?.results.length && !busy && !app.error);
  $effect(() => {
    if (busy || app.error) step = 2;
    else if (app.analysis && step === 2) step = 3;
  });
  const go = (n: number) => (step = Math.min(WIZARD.length, Math.max(1, n)));

  let mapImg = $state("");
  async function print() {
    mapImg = mapView.snapshot();
    document.querySelectorAll("details").forEach((d) => (d.open = true)); // Yagi table in the report
    await new Promise((r) => setTimeout(r, 100)); // let <img> decode
    window.print();
  }
</script>

<main>
  <MapView bind:this={mapView} />

  <h1 class="sr-only">Cek Sinyal TV Digital</h1>

  <div class="legend glass" aria-label="Legenda peta">
    <span><i class="dot" style="background:#f5b43c"></i>Pemancar (lokasi perkiraan)</span>
    <span><i class="dot" style="background:#22d3b5"></i>Pemancar (lokasi OSM)</span>
    <span><i class="pin"></i>Rumah Anda</span>
    {#if app.heatmapOn}
      <hr />
      <span><i style="background:#3cd282"></i>Kuat</span>
      <span><i style="background:#f5b43c"></i>Cukup</span>
      <span><i style="background:#f06e46"></i>Lemah</span>
      <span><i style="background:#e63c4b"></i>Tidak ada</span>
      <small class="muted">antena {app.height} m · zoom ≥ 9</small>
    {/if}
  </div>

  <BottomSheet>
    <nav class="wizard" aria-label="Langkah">
      <ol>
        {#each WIZARD as label, i (label)}
          {@const n = i + 1}
          <li class:done={n < step} class:current={n === step}>
            <button
              id="wizard-step-{n}"
              onclick={() => go(n)}
              disabled={n === 2 ? !app.home : n > 2 && !ready}
              aria-current={n === step ? "step" : undefined}
            >
              <b>{n}</b><span>{label}</span>
            </button>
          </li>
        {/each}
      </ol>
    </nav>

    <!-- Print shows every result section; screen shows only the current step. -->
    <section class="step no-print" class:show={step === 1}>
      <SearchBox onfound={(lat, lon) => mapView.flyTo(lat, lon)} />
      {#if app.home && ready}
        <button id="step1-next" class="btn primary wide" onclick={() => go(3)}>Lihat hasil untuk lokasi ini</button>
      {/if}
    </section>

    {#if step === 2}
      <section class="step show">
        <h2 class="title">Menganalisis jalur sinyal…</h2>
        <LoadingStepper />
      </section>
    {/if}

    {#if ready}
      <header class="print-head">
        <h2>Laporan Cek Sinyal TV Digital</h2>
        <p>
          Lokasi: {app.homeLabel} ({app.home?.lat.toFixed(5)}, {app.home?.lon.toFixed(5)}) · Tinggi antena {app.height} m · Dicetak
          {new Date().toLocaleString("id-ID")}
        </p>
      </header>
      {#if mapImg}<img class="print-map" src={mapImg} alt="Peta lokasi rumah dan jalur sinyal" />{/if}
      <section class="step" class:show={step === 3}>
        <ResultCard />
        <HeightSlider />
        <ProfileChart />
      </section>
      <section class="step" class:show={step === 3}>
        <Advice />
      </section>
      <p class="print-only muted">
        Estimasi model ITM (Longley-Rice) + ITU-R P.2108; bukan hasil ukur. Data pemancar sebagian perkiraan.
      </p>
      <section class="step no-print" class:show={step === 3}>
        <p class="muted small">
          Cetak berisi peta, kuat sinyal, profil jalur untuk antena {app.height} m, dan saran. Pilih "Simpan sebagai PDF" untuk menyimpan
          file.
        </p>
        <button id="print-report" class="btn primary wide" onclick={print}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
            aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z" /></svg
          >
          Cetak peta & hasil
        </button>
        <button id="other-location" class="btn wide" onclick={() => go(1)}>Cek lokasi lain</button>
      </section>
    {:else if app.analysis && !busy && !app.error && step > 2}
      <p>Semua pemancar terlalu dekat atau di luar jangkauan model. Coba geser titik rumah sedikit.</p>
    {/if}

    <footer>
      <button id="open-methods" class="link" onclick={() => methods.open()}>Metode</button>
      <span aria-hidden="true">·</span>
      <button id="open-contribute" class="link" onclick={() => contrib.open()}>Kontribusi</button>
      <span aria-hidden="true">·</span>
      <button id="open-privacy" class="link" onclick={() => privacy.open()}>Privasi</button>
    </footer>
  </BottomSheet>
</main>

<Welcome onlocate={() => mapView.locate()} />

<Modal bind:this={methods} id="methods" title="Metode perhitungan">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- own docs, escaped by markdown() -->
  {@html markdown(metode.replace(/^# .*\n/, ""))}
</Modal>

<Modal bind:this={contrib} id="contribute" title="Ikut berkontribusi">
  <p>Proyek ini terbuka. Data menara TV di Indonesia masih banyak yang berupa perkiraan, jadi bantuan Anda sangat berarti.</p>
  <ul>
    <li>
      <a href="{REPO}/issues/new?template=laporan-lapangan.yml" target="_blank" rel="noopener">Laporkan hasil lapangan</a>: di
      lokasi Anda sinyal diterima atau tidak.
    </li>
    <li>
      <a href="{REPO}/issues/new?template=data-pemancar.yml" target="_blank" rel="noopener">Koreksi data pemancar</a>: lokasi,
      tinggi menara, atau daya pancar.
    </li>
    <li>
      Tambahkan menara TV di <a href="https://www.openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a> dengan tag
      <code>man_made=mast</code>
      + <code>communication:television=yes</code>.
    </li>
    <li><a href="{REPO}/labels/good%20first%20issue" target="_blank" rel="noopener">Good first issue</a> untuk developer.</li>
  </ul>
  <p class="muted">Kode MIT · Data CC BY-SA 4.0 / ODbL · <a href={REPO} target="_blank" rel="noopener">GitHub</a></p>
</Modal>

<Modal bind:this={privacy} id="privacy" title="Privasi">
  <p>
    <strong>Lokasi rumah Anda tidak dikirim ke server kami.</strong> Kami memang tidak punya server; semua perhitungan berjalan di perangkat
    Anda.
  </p>
  <p>Layanan pihak ketiga yang diakses browser Anda:</p>
  <ul>
    <li>Esri World Imagery, OpenFreeMap, OpenTopoMap: tile peta dasar (area yang Anda lihat)</li>
    <li>AWS Terrain Tiles: ketinggian tanah</li>
    <li>Microsoft Planetary Computer: tutupan lahan (satu titik di rumah)</li>
    <li>Nominatim (OpenStreetMap): hanya jika Anda memakai kolom pencarian</li>
  </ul>
  <p class="muted">Seperti semua situs, layanan tersebut bisa melihat alamat IP dan area tile yang diminta.</p>
</Modal>

<style>
  main {
    position: relative;
    height: 100dvh;
    overflow: hidden;
  }
  .legend {
    position: absolute;
    left: 10px;
    top: calc(10px + env(safe-area-inset-top));
    z-index: 4;
    padding: 8px 10px;
    display: grid;
    gap: 3px;
    font-size: 0.72rem;
    border-radius: 12px;
  }
  .legend hr {
    width: 100%;
    border: 0;
    border-top: 1px solid var(--line);
    margin: 3px 0;
  }
  .legend .dot {
    border-radius: 50%;
    border: 2px solid #0b1218;
  }
  .legend .pin {
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    background: linear-gradient(135deg, var(--amber), hsl(20 95% 58%));
    border: 1.5px solid #fff;
  }
  .legend i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    margin-right: 6px;
  }
  :global(.maplibregl-ctrl-top-right) {
    top: env(safe-area-inset-top) !important;
  }
  :global([data-theme="dark"] .maplibregl-ctrl-group) {
    filter: invert(0.9) hue-rotate(180deg);
  }
  .wizard ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }
  .wizard button {
    width: 100%;
    min-height: 44px;
    border: 0;
    background: none;
    display: grid;
    justify-items: center;
    gap: 3px;
    font-size: 0.66rem;
    color: var(--muted);
    padding: 0;
  }
  .wizard b {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid var(--line);
    font-size: 0.72rem;
    transition: all 0.3s var(--ease);
  }
  .wizard .done b {
    background: var(--teal-soft);
    border-color: var(--teal);
    color: var(--teal);
  }
  .wizard .current button {
    color: var(--text);
    font-weight: 600;
  }
  .wizard .current b {
    background: var(--teal);
    border-color: var(--teal);
    color: var(--on-accent);
    box-shadow: 0 0 0 4px var(--teal-soft);
  }
  .step {
    display: none;
    gap: 10px;
  }
  .step.show {
    display: grid;
    animation: fade-up 0.35s var(--ease);
  }
  .title {
    font-size: 1.25rem;
  }
  .step p {
    margin: 0;
    line-height: 1.5;
  }
  .small {
    font-size: 0.8rem;
  }
  .wide {
    width: 100%;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0 10px;
    padding-top: 4px;
    border-top: 1px solid var(--line);
    color: var(--muted);
  }
  .link {
    background: none;
    border: 0;
    padding: 10px 2px;
    min-height: 44px;
    color: var(--teal);
    font-size: 0.82rem;
  }
  .print-map,
  .print-head,
  .print-only {
    display: none;
  }
  @media print {
    :global(html),
    :global(body),
    :global(#app),
    main {
      height: auto !important;
      overflow: visible !important;
    }
    :global(.map),
    .legend,
    footer,
    :global(#sheet-handle) {
      display: none !important;
    }
    :global(*) {
      animation: none !important;
      transition: none !important;
    }
    .step {
      display: grid !important;
      margin-bottom: 12px;
      break-inside: avoid;
    }
    .print-head,
    .print-only {
      display: block;
    }
    .print-head h2 {
      font-size: 1.3rem;
    }
    .print-head p {
      margin: 4px 0 10px;
      font-size: 0.8rem;
    }
    .no-print,
    .wizard {
      display: none !important;
    }
    .print-map {
      display: block;
      width: 100%;
      border-radius: 12px;
      margin-bottom: 12px;
    }
    :global(.sheet) {
      position: static !important;
      transform: none !important;
      height: auto !important;
      width: auto !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
    }
    :global(.sheet .content) {
      overflow: visible !important;
    }
  }
  @media (min-width: 900px) {
    .legend {
      left: auto;
      right: 16px;
      top: auto;
      bottom: 36px;
    }
  }
</style>
