<!--
  Antenna height slider (1 m steps). Results for every height are precomputed by the worker, so moving it is instant.
-->
<script lang="ts">
  import { app } from "../state.svelte.ts";
  import { ANALYSIS } from "../../config.ts";
  const { minHeightM: MIN, maxHeightM: MAX } = ANALYSIS;

  const set = (h: number) => (app.height = Math.min(MAX, Math.max(MIN, h)));
</script>

<div class="slider">
  <label for="antenna-height">Tinggi antena dari tanah <output for="antenna-height">{app.height} m</output></label>
  <div class="row">
    <button
      id="height-minus"
      class="btn icon"
      onclick={() => set(app.height - 1)}
      disabled={app.height <= MIN}
      aria-label="Turunkan 1 meter">−</button
    >
    <input
      id="antenna-height"
      type="range"
      min={MIN}
      max={MAX}
      step="1"
      bind:value={app.height}
      style="--p:{((app.height - MIN) / (MAX - MIN)) * 100}%"
      aria-valuetext="{app.height} meter"
    />
    <button
      id="height-plus"
      class="btn icon"
      onclick={() => set(app.height + 1)}
      disabled={app.height >= MAX}
      aria-label="Naikkan 1 meter">+</button
    >
  </div>
</div>

<style>
  label {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: var(--muted);
  }
  output {
    font-family: var(--display);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
  }
  .row .btn {
    font-size: 1.3rem;
  }
  input {
    flex: 1;
    appearance: none;
    height: 44px;
    background: transparent;
  }
  input::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--teal) var(--p), var(--track) var(--p));
  }
  input::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--teal) var(--p), var(--track) var(--p));
  }
  input::-webkit-slider-thumb {
    appearance: none;
    width: 26px;
    height: 26px;
    margin-top: -10px;
    border-radius: 50%;
    background: #fff;
    border: 4px solid var(--teal);
    box-shadow: 0 2px 10px hsl(172 72% 48% / 0.5);
  }
  input::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    border: 4px solid var(--teal);
  }
  @media print {
    .row {
      display: none;
    }
  }
</style>
