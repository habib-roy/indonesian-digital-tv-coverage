<!--
  Accessible modal on native <dialog> (focus trap, Esc, backdrop click). Open via bind:this → .open().
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  let { id, title, children }: { id: string; title: string; children: Snippet } = $props();
  let dlg: HTMLDialogElement;
  export const open = () => dlg.showModal();
</script>

<dialog bind:this={dlg} {id} aria-labelledby="{id}-title" closedby="any">
  <header>
    <h2 id="{id}-title">{title}</h2>
    <button class="btn icon" onclick={() => dlg.close()} aria-label="Tutup">✕</button>
  </header>
  <div class="body">{@render children()}</div>
</dialog>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .body {
    font-size: 0.92rem;
    line-height: 1.6;
  }
  .body :global(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    display: block;
    overflow-x: auto;
  }
  .body :global(th),
  .body :global(td) {
    border-bottom: 1px solid var(--line);
    padding: 6px 4px;
    text-align: left;
  }
  .body :global(h2),
  .body :global(h3) {
    margin-top: 1.2em;
    font-size: 1.05rem;
  }
  .body :global(li) {
    margin-bottom: 6px;
  }
</style>
