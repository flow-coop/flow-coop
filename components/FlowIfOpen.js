import { ReceiveResourceOS } from "./ReceiveResourceOS.js";
import { requestVersionContext } from "./requestVersionContext.js";

/**
 * Renders its direct template only when the inherited RDF resource is unused.
 *
 * @customElement flow-if-open
 * @attr {string} uri - Optional resource URI overriding the PodOS resource.
 * @dependency Inherits its Note resource through PodOS and requires an ancestor
 * `flow-version-context`, requested through `flow:request-version-context`.
 * @slot - A direct template containing the content rendered for an open item.
 * @fires flow:open-state - Reports whether the resource is open or failed.
 * @fires flow:error - Code `version-context-unavailable` reports missing or
 * failed version context and evaluation failures; the item fails closed.
 * @example <flow-if-open uri="https://example.test/note"><template>Open</template></flow-if-open>
 */
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
      const context = await requestVersionContext(this);
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
        new CustomEvent("flow:open-state", {
          bubbles: true,
          detail: { uri: resourceUri, open: false, error },
        }),
      );
      this.dispatchEvent(
        new CustomEvent("flow:error", {
          bubbles: true,
          detail: {
            component: "flow-if-open",
            code: "version-context-unavailable",
            error,
          },
        }),
      );
    }
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
