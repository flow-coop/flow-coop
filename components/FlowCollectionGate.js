/**
 * Instantiates an authored template after a descendant collection is ready.
 *
 * @customElement flow-collection-gate
 * @dependency Listens for `flow:collection-ready` and collection `flow:error`
 * events from a descendant `flow-collection-pages`.
 * @slot - Discussion markup, an authored loading state, a direct ready
 * template, and an optional direct `data-error-template`.
 * @fires flow:error - Reports a missing ready template with
 * `collection-gate-template-missing`.
 * @example <flow-collection-gate><flow-collection-pages></flow-collection-pages><p data-collection-waiting>Loading...</p><template>Ready</template></flow-collection-gate>
 */
export class FlowCollectionGate extends HTMLElement {
  constructor() {
    super();
    this._renderedNodes = [];
    this._handleReady = () => this.renderReady();
    this._handleError = event => {
      if (
        event.detail?.component === "flow-collection-pages" &&
        !this.hasAttribute("ready")
      ) {
        this.renderError();
      }
    };
  }

  connectedCallback() {
    this.addEventListener("flow:collection-ready", this._handleReady);
    this.addEventListener("flow:error", this._handleError);
    queueMicrotask(() => {
      if (this.querySelector("flow-collection-pages[ready]")) {
        this.renderReady();
      } else if (this.querySelector("flow-collection-pages[error]")) {
        this.renderError();
      }
    });
  }

  disconnectedCallback() {
    this.removeEventListener("flow:collection-ready", this._handleReady);
    this.removeEventListener("flow:error", this._handleError);
    this.clearRenderedNodes();
  }

  renderReady() {
    if (this.hasAttribute("ready")) return;
    const template = this.querySelector(
      ":scope > template:not([data-error-template])",
    );
    if (!template) {
      this.reportMissingTemplate();
      return;
    }
    this.renderTemplate(template);
    this.removeAttribute("error");
    this.setAttribute("ready", "");
    this.updateWaitingState();
  }

  renderError() {
    if (this.hasAttribute("ready") || this.hasAttribute("error")) return;
    const template = this.querySelector(":scope > template[data-error-template]");
    if (template) this.renderTemplate(template);
    this.setAttribute("error", "");
    this.updateWaitingState();
  }

  renderTemplate(template) {
    const fragment = template.content.cloneNode(true);
    this._renderedNodes.push(...fragment.childNodes);
    template.before(fragment);
  }

  updateWaitingState() {
    const waiting = this.querySelector(":scope > [data-collection-waiting]");
    if (waiting) waiting.hidden = true;
  }

  reportMissingTemplate() {
    const error = new Error(
      "flow-collection-gate requires a direct child ready template.",
    );
    this.renderError();
    this.dispatchEvent(
      new CustomEvent("flow:error", {
        bubbles: true,
        detail: {
          component: "flow-collection-gate",
          code: "collection-gate-template-missing",
          error,
        },
      }),
    );
  }

  clearRenderedNodes() {
    for (const node of this._renderedNodes) node.remove();
    this._renderedNodes = [];
  }
}

if (!customElements.get("flow-collection-gate")) {
  customElements.define("flow-collection-gate", FlowCollectionGate);
}
