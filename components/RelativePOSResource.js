import { getBaseUri } from "./getBaseUri.js";

class RelativePOSResource extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    
    const uri = this.getAttribute("uri");

    if (!uri) {
      throw new Error("<relative-pos-resource> requires a uri");
    }

    const resource = document.createElement("pos-resource");
    resource.setAttribute(
      "uri",
      new URL(uri, getBaseUri(this.baseURI)).href
    );

    resource.append(...this.childNodes);
    this.replaceChildren(resource);
  }
}

customElements.define("relative-pos-resource", RelativePOSResource);