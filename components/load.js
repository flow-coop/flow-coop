import "https://cdn.jsdelivr.net/npm/@ionic/core@9.0.0/dist/ionic/ionic.esm.js";
import "https://cdn.jsdelivr.net/npm/@pod-os/elements@0.43.0/dist/elements/elements.esm.js";
import "./ImportHtml.js";
import "./UpdateLocation.js";
import {
  createComponentLoader,
  observeRegisteredElements,
} from "./ComponentLoader.js";

const loader = createComponentLoader();

function observe() {
  observeRegisteredElements(document, loader);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observe, { once: true });
} else {
  observe();
}

export const whenFlowComponentsReady = () => loader.whenIdle();
