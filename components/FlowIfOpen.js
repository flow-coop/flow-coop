import { ReceiveResourceOS } from "./ReceiveResourceOS.js";

export class FlowIfOpen extends ReceiveResourceOS {
  constructor() {
    super();
    this._generation = 0;
    this._renderedNodes = [];
    this._provideResource = (event) => {
      if (event.target === this || typeof event.detail !== "function") return;
      event.stopPropagation();
      if (this.resource) event.detail(this.resource);
    };
  }

  connectedCallback() {
    this.addEventListener("pod-os:resource", this._provideResource);
    super.connectedCallback();
  }

  disconnectedCallback() {
    clearTimeout(this._osTimer);
    this.removeEventListener("pod-os:resource", this._provideResource);
    this._generation += 1;
    this.clearRenderedNodes();
  }

  update() {
    const explicitUri = this.getAttribute("uri");
    if (explicitUri && this.os) this.resource = this.os.store.get(explicitUri);
    const resourceUri = explicitUri || this.resource?.uri;
    if (!resourceUri) return false;
    void this.evaluate(resourceUri, ++this._generation);
    return true;
  }

  async evaluate(resourceUri, generation) {
    this.removeAttribute("open");
    this.removeAttribute("closed");
    this.removeAttribute("error");
    this.setAttribute("loading", "");

    try {
      const context = await this.requestVersionContext();
      if (generation !== this._generation) return;
      const open = !context.usedUris.has(resourceUri);
      this.removeAttribute("loading");
      this.toggleAttribute("open", open);
      this.toggleAttribute("closed", !open);
      this.render(open);
      this.dispatchEvent(
        new CustomEvent("flow:open-state", {
          bubbles: true,
          detail: { uri: resourceUri, open },
        }),
      );
    } catch (error) {
      if (generation !== this._generation) return;
      this.removeAttribute("loading");
      this.setAttribute("error", "");
      this.clearRenderedNodes();
      this.dispatchEvent(
        new CustomEvent("flow:error", {
          bubbles: true,
          detail: { component: "flow-if-open", error },
        }),
      );
    }
  }

  requestVersionContext() {
    return new Promise((resolve, reject) => {
      let supplied = false;
      const event = new CustomEvent("flow:request-version-context", {
        bubbles: true,
        composed: true,
        detail: {
          resolve: (contextPromise) => {
            supplied = true;
            Promise.resolve(contextPromise).then(resolve, reject);
          },
        },
      });
      this.dispatchEvent(event);
      if (!supplied)
        reject(new Error("No flow-version-context ancestor found."));
    });
  }

  render(open) {
    this.clearRenderedNodes();
    if (!open) return;
    const template = this.querySelector(":scope > template");
    if (!template)
      throw new Error("flow-if-open requires a direct child template.");
    const fragment = template.content.cloneNode(true);
    this._renderedNodes = Array.from(fragment.childNodes);
    template.before(fragment);
  }

  clearRenderedNodes() {
    for (const node of this._renderedNodes) node.remove();
    this._renderedNodes = [];
  }
}

if (!customElements.get("flow-if-open")) {
  customElements.define("flow-if-open", FlowIfOpen);
}
