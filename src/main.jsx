/* @refresh reload */
import { render } from "solid-js/web";
import { App } from "./App.jsx";
import "./styles.css";

render(() => <App />, document.getElementById("root"));

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
