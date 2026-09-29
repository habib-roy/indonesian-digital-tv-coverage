<!--
  First-visit walkthrough + location prompt (native <dialog>).
  - Walkthrough slides until the user ticks "don't show again" (localStorage "tour-off").
  - Always ends by asking for location, so analysis can start without searching.
  - If location permission is already granted, skip the dialog and locate straight away.
  The permission prompt is triggered by a button click (browsers/Lighthouse flag prompts on page load).
-->
<script lang="ts">
  import { onMount } from "svelte";

  let { onlocate }: { onlocate: () => void } = $props();

  const SLIDES = [
    {
      t: "Tandai rumah Anda",
      d: "Pakai lokasi Anda, cari alamat, atau ketuk peta tepat di atap rumah.",
    },
    {
      t: "Analisis otomatis",
      d: "Jalur sinyal dari menara pemancar dihitung lurus melewati bentuk muka bumi.",
    },
    {
      t: "Lihat hasil",
      d: "Hasil perkiraan kekuatan sinyal, tinggi antena minimum, arah antena, dan jenis antena.",
    },
  ];
  const TOUR_KEY = "tour-off";

  let dlg: HTMLDialogElement;
  let tourOff = $state(localStorage.getItem(TOUR_KEY) === "1");
  let i = $state(0);
  const onAsk = $derived(tourOff || i >= SLIDES.length);

  onMount(async () => {
    const state = await navigator.permissions?.query({ name: "geolocation" }).then(
      (p) => p.state,
      () => "prompt",
    );
    if (state === "granted") return onlocate();
    if (tourOff && state === "denied") return; // nothing to show or ask
    if (tourOff) i = SLIDES.length;
    dlg.showModal();
  });

  function close(locate: boolean) {
    dlg.close(); // focus after close, otherwise <dialog> restores focus to the previous element
    if (locate) onlocate();
    else document.getElementById("search-input")?.focus();
  }
  const save = () => (tourOff ? localStorage.setItem(TOUR_KEY, "1") : localStorage.removeItem(TOUR_KEY));
</script>

<dialog bind:this={dlg} id="welcome" aria-labelledby="welcome-title" onclose={save}>
  {#if !onAsk}
    {@const s = SLIDES[i]}
    <p class="count muted">Panduan {i + 1}/{SLIDES.length}</p>
    <h2 id="welcome-title">{s.t}</h2>
    <p>{s.d}</p>
    <div class="dots" aria-hidden="true">
      {#each SLIDES.keys() as n (n)}<i class:on={n === i}></i>{/each}
    </div>
    <div class="row">
      <button id="tour-back" class="btn" onclick={() => i--} disabled={i === 0}>Kembali</button>
      <button id="tour-next" class="btn primary" onclick={() => i++}>Lanjut</button>
    </div>
  {:else}
    <h2 id="welcome-title">Gunakan lokasi Anda?</h2>
    <p>Analisis langsung dimulai dari posisi Anda (GPS akurasi tinggi). Lokasi tidak dikirim ke server kami.</p>
    <div class="row">
      <button id="welcome-later" class="btn" onclick={() => close(false)}>Cari manual</button>
      <button id="welcome-locate" class="btn primary" onclick={() => close(true)}>Gunakan geolocation</button>
    </div>
  {/if}
  <div class="foot">
    <label class="off"><input id="tour-off" type="checkbox" bind:checked={tourOff} />Jangan tampilkan lagi</label>
    {#if !onAsk}<button id="tour-skip" class="skip" onclick={() => (i = SLIDES.length)}>Lewati</button>{/if}
  </div>
</dialog>

<style>
  dialog {
    max-width: 380px;
    --blue: hsl(212 85% 52%);
  }
  h2 {
    font-size: 1.2rem;
    margin: 0 0 6px;
  }
  p {
    margin: 0 0 12px;
    line-height: 1.5;
  }
  .count {
    font-size: 0.75rem;
    margin-bottom: 4px;
  }
  .dots {
    display: flex;
    gap: 6px;
    justify-content: center;
    margin-bottom: 14px;
  }
  .dots i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--line);
    transition: all 0.3s var(--ease);
  }
  .dots .on {
    width: 20px;
    border-radius: 4px;
    background: var(--teal);
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    gap: 8px;
  }
  .row .btn {
    min-height: 40px;
    padding: 0 12px;
    font-size: 0.85rem;
  }
  .row .btn:not(:disabled):hover {
    background: var(--blue);
    border-color: var(--blue);
    color: #fff;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
  }
  .off {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .off input {
    accent-color: var(--teal);
  }
  .skip {
    min-height: 44px;
    padding: 0 6px;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 0.82rem;
    text-decoration: underline;
  }
  .skip:hover {
    color: var(--blue);
  }
</style>
