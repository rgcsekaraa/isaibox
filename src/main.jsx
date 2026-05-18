/* @refresh reload */
import { render } from "solid-js/web";
import { App } from "./App.jsx";
import "./styles.css";

function syncVisualViewport() {
  const viewport = window.visualViewport;
  const innerHeight = window.innerHeight || document.documentElement.clientHeight;
  const visualHeight = viewport?.height || 0;
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;
  const visibleHeight = Math.max(innerHeight, visualHeight, document.documentElement.clientHeight || 0);
  const screenHeight = isStandalone ? (window.screen?.height || 0) : 0;
  const height = Math.round(Math.max(visibleHeight, screenHeight));
  const root = document.documentElement;
  root.style.setProperty("--app-viewport-height", `${height}px`);
  root.style.setProperty("--app-viewport-top", "0px");
  root.style.setProperty("--app-viewport-bottom", "0px");
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
