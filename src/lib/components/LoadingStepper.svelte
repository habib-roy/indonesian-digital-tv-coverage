<!--
  Progress list for the 5 analysis steps (STEPS in state.svelte.ts). Failed steps show a retry button.
-->
<script lang="ts">
  import { app, STEPS, analyse } from "../state.svelte.ts";
</script>

<ol class="stepper" aria-label="Proses analisis" aria-live="polite">
  {#each STEPS as label, i (label)}
    {@const s = app.steps[i]}
    <li class={s} style="--i:{i}">
      <span class="dot" aria-hidden="true">
        {#if s === "done"}
          <svg viewBox="0 0 24 24" width="14" height="14"
            ><path
              d="M5 12.5 10 17 19 7"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            /></svg
          >
        {:else if s === "error"}!{:else}{i + 1}{/if}
      </span>
      <span class="label">
        {label}
        {#if s === "active" && app.progress}<small class="muted"> · {app.progress}</small>{/if}
        <span class="sr-only">
          — {s === "done" ? "selesai" : s === "active" ? "sedang berjalan" : s === "error" ? "gagal" : "menunggu"}
        </span>
      </span>
    </li>
    {#if s === "error"}
      <li class="err">
        <p>{app.error}</p>
        <button id="retry-step-{i}" class="btn" onclick={() => analyse(i)}>Coba lagi</button>
      </li>
    {/if}
  {/each}
</ol>

<style>
  .stepper {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 4px;
    color: var(--muted);
    transition: color 0.3s;
    animation: fade-up 0.35s var(--ease) both;
    animation-delay: calc(var(--i) * 60ms);
    position: relative;
  }
  li:not(.err):not(:last-child)::after {
    content: "";
    position: absolute;
    left: 17px;
    top: 36px;
    height: calc(100% - 28px);
    width: 2px;
    background: var(--line);
  }
  li.done::after {
    background: var(--teal) !important;
  }
  .dot {
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 0.8rem;
    font-weight: 700;
    border: 2px solid var(--line);
    transition: all 0.35s var(--ease);
  }
  .active {
    color: var(--text);
  }
  .active .dot {
    border-color: var(--teal);
    color: var(--teal);
    box-shadow: 0 0 0 0 hsl(172 72% 48% / 0.5);
    animation: pulse 1.4s infinite;
  }
  .done {
    color: var(--text);
  }
  .done .dot {
    background: var(--teal);
    border-color: var(--teal);
    color: var(--on-accent);
    animation: check 0.4s var(--ease);
  }
  .error .dot {
    border-color: var(--red);
    color: var(--red);
  }
  .err {
    flex-direction: column;
    align-items: flex-start;
    margin: 0 0 6px 40px;
    padding: 10px 12px;
    border-radius: 12px;
    background: hsl(356 82% 62% / 0.1);
    color: var(--text);
  }
  .err p {
    margin: 0;
    font-size: 0.88rem;
  }
  @keyframes pulse {
    70% {
      box-shadow: 0 0 0 8px hsl(172 72% 48% / 0);
    }
  }
  @keyframes check {
    from {
      transform: scale(0.4);
    }
  }
</style>
