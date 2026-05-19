/* @refresh reload */
import { render } from "solid-js/web";
import { App } from "./App.jsx";
import "./styles.css";

const isStandalonePWA = () =>
  (typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: fullscreen)").matches ||
      window.navigator.standalone === true)) || false;

function applyStandaloneAttr() {
  document.documentElement.dataset.pwa = isStandalonePWA() ? "standalone" : "browser";
}

function syncVisualViewport() {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const layout = window.innerHeight || document.documentElement.clientHeight || 0;
  const visual = viewport?.height || layout;
  const standalone = isStandalonePWA();
  // Keyboard heuristic: visual viewport noticeably shorter than layout
  const keyboardOpen = layout > 0 && visual > 0 && layout - visual > 80;
  // In standalone PWA, pin layout to innerHeight (no URL bar to chase);
  // only shrink when keyboard is up. In browser, follow visual viewport so
  // the layout grows back when Safari hides the URL bar.
  const base = standalone ? layout : visual;
  const height = Math.round(Math.max(320, keyboardOpen ? visual : base));
  root.style.setProperty("--app-viewport-height", `${height}px`);
}

applyStandaloneAttr();
syncVisualViewport();

window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", () => {
  applyStandaloneAttr();
  syncVisualViewport();
});
window.addEventListener("resize", syncVisualViewport, { passive: true });
window.addEventListener("orientationchange", syncVisualViewport, { passive: true });
window.visualViewport?.addEventListener("resize", syncVisualViewport, { passive: true });
window.visualViewport?.addEventListener("scroll", syncVisualViewport, { passive: true });

render(() => <App />, document.getElementById("root"));

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
