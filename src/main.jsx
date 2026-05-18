/* @refresh reload */
import { render } from "solid-js/web";
import { App } from "./App.jsx";
import "./styles.css";

function syncVisualViewport() {
  const viewport = window.visualViewport;
  const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const visualHeight = viewport?.height || layoutHeight;
  const height = Math.round(Math.max(320, visualHeight || layoutHeight));
  const viewportBottom = Math.max(0, layoutHeight - visualHeight - (viewport?.offsetTop || 0));
  const root = document.documentElement;
  root.style.setProperty("--app-viewport-height", `${height}px`);
  root.style.setProperty("--app-viewport-top", "0px");
  root.style.setProperty("--app-viewport-bottom", `${Math.round(viewportBottom)}px`);
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
