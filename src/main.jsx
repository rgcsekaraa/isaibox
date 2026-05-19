/* @refresh reload */
import { render } from "solid-js/web";
import { App } from "./App.jsx";
import "./styles.css";

const isStandalonePWA = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true);

let lockedHeight = 0;

function applyStandaloneAttr() {
  document.documentElement.dataset.pwa = isStandalonePWA() ? "standalone" : "browser";
}

// Capture the largest innerHeight we observe and never shrink below it.
// On iOS PWA standalone the web view shrinks when the keyboard opens;
// freezing the CSS frame at this max lets the keyboard overlay UI (the
// app keeps its shape, tabs get clipped behind the keyboard) instead
// of pushing the bottom bar up.
function captureMaxHeight() {
  const h = window.innerHeight || document.documentElement.clientHeight || 0;
  if (h > 0 && h > lockedHeight) {
    lockedHeight = h;
    document.documentElement.style.setProperty(
      "--app-locked-height",
      `${lockedHeight}px`
    );
  }
}

function resetMaxHeight() {
  lockedHeight = 0;
  document.documentElement.style.removeProperty("--app-locked-height");
  // Wait for the new orientation to settle before recapturing.
  setTimeout(captureMaxHeight, 250);
  setTimeout(captureMaxHeight, 600);
}

applyStandaloneAttr();
captureMaxHeight();
// Recapture once the DOM is fully ready in case innerHeight grows.
window.addEventListener("load", captureMaxHeight, { once: true });

window
  .matchMedia?.("(display-mode: standalone)")
  .addEventListener?.("change", () => {
    applyStandaloneAttr();
    resetMaxHeight();
  });

window.addEventListener("orientationchange", resetMaxHeight);
window.addEventListener("resize", captureMaxHeight, { passive: true });

render(() => <App />, document.getElementById("root"));

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
