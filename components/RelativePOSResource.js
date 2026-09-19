function getBaseUri(pageBaseURI) {
  const url = new URL(pageBaseURI);

  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1"
  ) {
    return new URL(
      `${url.pathname}${url.search}${url.hash}`,
      "https://flowcoop.eu"
    ).href;
  }

  return url.href;
}

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