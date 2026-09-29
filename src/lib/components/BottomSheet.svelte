<!--
  Results container. Mobile: draggable bottom sheet with snap points (config UI.sheetSnaps). Desktop (≥900 px): fixed right sidebar.
-->
<script lang="ts">
  import { UI } from "../../config.ts";
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  // Snap points as % of viewport height visible (mobile only; desktop = sidebar via CSS).
  const SNAPS = UI.sheetSnaps;
  let snap = $state(1);
  let drag: { y0: number; h0: number } | null = null;
  let live = $state<number | null>(null);
  let sheet: HTMLElement;

  const visible = $derived(live ?? SNAPS[snap]);

  function down(e: PointerEvent) {
    drag = { y0: e.clientY, h0: SNAPS[snap] };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    live = Math.min(95, Math.max(10, drag.h0 - ((e.clientY - drag.y0) / innerHeight) * 100));
  }
  function up() {
    if (!drag) return;
    const v = live ?? SNAPS[snap];
    snap = SNAPS.reduce((best, s, i) => (Math.abs(s - v) < Math.abs(SNAPS[best] - v) ? i : best), 0);
    drag = null;
    live = null;
  }
  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp") snap = Math.min(2, snap + 1);
    if (e.key === "ArrowDown") snap = Math.max(0, snap - 1);
  };
  export const expand = () => {
    if (snap === 0) snap = 1;
    sheet?.scrollTo({ top: 0 });
  };
</script>

<aside class="sheet glass" class:dragging={live !== null} style="--vis:{visible}dvh" aria-label="Hasil analisis">
  <button
    id="sheet-handle"
    class="handle"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={key}
    onclick={() => live === null && (snap = snap === 2 ? 1 : snap + 1)}
    aria-label="Tarik untuk memperbesar atau memperkecil panel"><span></span></button
  >
  <div class="content" bind:this={sheet}>
    {@render children()}
  </div>
</aside>

<style>
  .sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 95dvh;
    transform: translateY(calc(95dvh - var(--vis)));
    border-radius: 24px 24px 0 0;
    border-bottom: 0;
    display: flex;
    flex-direction: column;
    transition: transform 0.45s var(--ease);
    z-index: 5;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .dragging {
    transition: none;
  }
  .handle {
    flex: none;
    height: 32px;
    border: 0;
    background: transparent;
    display: grid;
    place-items: center;
    touch-action: none;
    cursor: grab;
  }
  .handle span {
    width: 44px;
    height: 5px;
    border-radius: 3px;
    background: hsl(200 20% 80% / 0.35);
  }
  .content {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 16px 24px;
    display: grid;
    align-content: start;
    gap: 14px;
  }
  @media (min-width: 900px) {
    .sheet {
      top: 16px;
      left: 16px;
      bottom: 16px;
      right: auto;
      width: 420px;
      height: auto;
      transform: none;
      border-radius: var(--radius);
      border-bottom: 1px solid var(--line);
    }
    .handle {
      display: none;
    }
    .content {
      padding-top: 16px;
    }
  }
</style>
