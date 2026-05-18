/* @refresh reload */
import { render } from "solid-js/web";
import { App } from "./App.jsx";
import "./styles.css";

function syncVisualViewport() {
  const viewport = window.visualViewport;
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;
  const innerHeight = window.innerHeight || document.documentElement.clientHeight;
  const height = Math.round(isStandalone ? innerHeight : (viewport?.height || innerHeight));
  const offsetTop = isStandalone ? 0 : Math.round(viewport?.offsetTop || 0);
  const bottom = isStandalone ? 0 : Math.max(0, Math.round((innerHeight || height) - height - offsetTop));
  const root = document.documentElement;
  root.style.setProperty("--app-viewport-height", `${height}px`);
  root.style.setProperty("--app-viewport-top", `${offsetTop}px`);
  root.style.setProperty("--app-viewport-bottom", `${bottom}px`);
}

syncVisualViewport();
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
