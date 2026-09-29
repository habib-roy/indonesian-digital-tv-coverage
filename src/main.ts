import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { GA_HOST, GA_ID } from "./config.ts";

const app = mount(App, {
  target: document.getElementById("app")!,
});

// PWA: installable + UI shell offline. Production only, so dev never serves stale files.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => void navigator.serviceWorker.register("./sw.js"));
}

// Google Analytics: production domain only (keeps dev/preview traffic out), loaded after page load so it
// never competes with the map. Page views only; the home location is never sent.
if (location.hostname === GA_HOST) {
  const w = window as typeof window & { dataLayer: unknown[]; gtag: (...a: unknown[]) => void };
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () {
    // eslint-disable-next-line prefer-rest-params -- gtag.js requires the `arguments` object
    w.dataLayer.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("config", GA_ID);
  addEventListener("load", () => {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.append(s);
  });
}

export default app;
