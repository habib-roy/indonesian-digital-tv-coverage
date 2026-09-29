<!--
  Address search (Nominatim, max 1 req/s per usage policy) + "use my location" (Geolocation API).
-->
<script lang="ts">
  import { NOMINATIM, UI } from "../../config.ts";
  import { app, analyse } from "../state.svelte.ts";

  let { onfound }: { onfound: (lat: number, lon: number) => void } = $props();

  let q = $state("");
  let busy = $state(false);
  let cooldown = $state(0);
  let msg = $state("");
  let results: { display_name: string; lat: string; lon: string }[] = $state([]);
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- plain cache, not rendered
  const cache = new Map<string, typeof results>();
  $effect(() => {
    if (!msg) return;
    const t = setTimeout(() => (msg = ""), UI.messageTimeoutMs);
    return () => clearTimeout(t);
  });
  let last = 0;

  // Nominatim usage policy: max 1 request/second, no autocomplete.
  async function search(e: SubmitEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query || busy || cooldown > 0) return;
    msg = "";
    if (cache.has(query)) return void (results = cache.get(query)!);
    const wait = NOMINATIM.minIntervalMs - (Date.now() - last);
    if (wait > 0) return;
    busy = true;
    last = Date.now();
    try {
      const u = `${NOMINATIM.url}?${new URLSearchParams({ ...NOMINATIM.params, q: query })}`;
      const r = await fetch(u);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      results = await r.json();
      cache.set(query, results);
      if (!results.length) msg = "Alamat tidak ditemukan. Coba nama desa/kecamatan, atau ketuk peta.";
    } catch {
      msg = "Pencarian gagal. Coba lagi atau ketuk langsung di peta.";
    } finally {
      busy = false;
      cooldown = 1;
      const t = setInterval(() => {
        const left = Math.ceil((NOMINATIM.minIntervalMs - (Date.now() - last)) / 1000);
        cooldown = Math.max(0, left);
        if (cooldown === 0) clearInterval(t);
      }, 100);
    }
  }

  function pick(r: (typeof results)[number]) {
    results = [];
    const lat = +r.lat;
    const lon = +r.lon;
    app.home = { lat, lon };
    app.homeLabel = r.display_name.split(",").slice(0, 3).join(",");
    onfound(lat, lon);
    void analyse();
  }

  let locating = $state(false);
  function locate() {
    msg = "";
    locating = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        locating = false;
        const { latitude: lat, longitude: lon } = p.coords;
        app.home = { lat, lon };
        app.homeLabel = "Lokasi saya";
        onfound(lat, lon);
        void analyse();
      },
      (err) => {
        locating = false;
        msg =
          err.code === 1
            ? "Izin lokasi ditolak. Cari alamat atau ketuk peta."
            : "Lokasi tidak didapat. Cari alamat atau ketuk peta.";
      },
      { enableHighAccuracy: true, timeout: UI.geolocationTimeoutMs },
    );
  }
</script>

<div class="search glass">
  <form onsubmit={search} role="search">
    <label for="search-input" class="sr-only">Cari alamat rumah</label>
    <input
      id="search-input"
      type="text"
      bind:value={q}
      placeholder="Cari alamat / desa / kecamatan…"
      autocomplete="street-address"
      enterkeyhint="search"
    />
    <button
      id="search-submit"
      class="btn primary icon"
      type="submit"
      disabled={busy || cooldown > 0 || !q.trim()}
      aria-label="Cari"
    >
      {#if busy}<span class="spin"></span>{:else if cooldown > 0}{cooldown}s{:else}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"
          ><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg
        >
      {/if}
    </button>
    <button id="locate-me" class="btn icon" type="button" onclick={locate} disabled={locating} aria-label="Gunakan lokasi saya">
      {#if locating}<span class="spin"></span>{:else}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"
          ><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg
        >
      {/if}
    </button>
  </form>
  {#if results.length}
    <ul class="results" role="listbox" aria-label="Hasil pencarian">
      {#each results as r, i (r.lat + r.lon)}
        <li>
          <button id="search-result-{i}" role="option" aria-selected="false" onclick={() => pick(r)}>{r.display_name}</button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if msg}<p class="msg" role="status">{msg}</p>{/if}
</div>

<style>
  .search {
    padding: 6px;
    border-radius: 16px;
  }
  form {
    display: flex;
    gap: 6px;
  }
  input {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 0 14px;
    border: 0;
    border-radius: 12px;
    background: var(--inset);
    color: var(--text);
    font: inherit;
    font-size: 16px; /* prevents iOS zoom */
  }
  input::placeholder {
    color: var(--muted);
  }
  .results {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    max-height: 40dvh;
    overflow: auto;
  }
  .results button {
    width: 100%;
    text-align: left;
    padding: 12px;
    min-height: 44px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    font-size: 0.9rem;
    animation: fade-up 0.25s var(--ease) both;
  }
  .results button:hover {
    background: var(--teal-soft);
  }
  .msg {
    margin: 8px 6px 4px;
    font-size: 0.85rem;
    color: var(--amber);
  }
  .spin {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2.5px solid currentColor;
    border-right-color: transparent;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }
</style>
