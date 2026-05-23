/* @refresh reload */
import { render } from "solid-js/web";
import { App } from "./App.jsx";
import "./styles.css";

const isStandalonePWA = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true);

const THEME_COLORS = { light: "#f7f7f4", dark: "#0a0a0b" };

function applyStandaloneAttr() {
  document.documentElement.dataset.pwa = isStandalonePWA() ? "standalone" : "browser";
}

// Keep the iOS safe-area colour in sync with the active theme. Without this
// the home-indicator strip stays painted with the meta theme-color (dark)
// even when the app is in light mode, which looks like a black band.
function syncThemeColor() {
  const theme = document.documentElement.dataset.theme || "dark";
  const colour = THEME_COLORS[theme] || THEME_COLORS.dark;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", colour);
}

applyStandaloneAttr();
syncThemeColor();

new MutationObserver(syncThemeColor).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});

window
  .matchMedia?.("(display-mode: standalone)")
  .addEventListener?.("change", applyStandaloneAttr);

render(() => <App />, document.getElementById("root"));

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
