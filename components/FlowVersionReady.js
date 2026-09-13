/**
 * Instantiates an authored template after its version context is ready.
 *
 * @customElement flow-version-ready
 * @dependency Reads readiness and errors from the nearest `flow-version-context`.
 * @slot - A direct ready template, an authored loading state, and an optional
 * direct `template[data-error-template]`.
 * @fires flow:error - Reports a missing context or ready template with
 * `version-ready-context-missing` or `version-ready-template-missing`.
 * @example <flow-version-ready><p data-version-waiting>Loading...</p><template>Ready</template></flow-version-ready>
 */
export class FlowVersionReady extends HTMLElement {
  constructor() {
    super();
    this._renderedNodes = [];
    this._context = null;
    this._handleReady = event => {
      if (event.target === this._context) this.renderReady();
    };
    this._handleError = event => {
      if (event.target === this._context) this.renderError();
    };
  }

  connectedCallback() {
    this.updateWaitingState(false);
    this._context = this.closest("flow-version-context");
    if (!this._context) {
      this.reportError(
        "version-ready-context-missing",
        new Error("flow-version-ready requires a flow-version-context ancestor."),
      );
      return;
    }

    this._context.addEventListener("flow:version-ready", this._handleReady);
    this._context.addEventListener("flow:error", this._handleError);
    if (this._context.hasAttribute("ready")) this.renderReady();
    else if (this._context.hasAttribute("error")) this.renderError();
  }

  disconnectedCallback() {
    this._context?.removeEventListener("flow:version-ready", this._handleReady);
    this._context?.removeEventListener("flow:error", this._handleError);
    this._context = null;
    this.clearRenderedNodes();
    this.removeAttribute("ready");
    this.removeAttribute("error");
  }

  renderReady() {
    if (this.hasAttribute("ready")) return;
    const template = this.querySelector(
      ":scope > template:not([data-error-template])",
    );
    if (!template) {
      this.reportError(
        "version-ready-template-missing",
        new Error("flow-version-ready requires a direct child ready template."),
      );
      return;
    }
    this.renderTemplate(template);
    this.removeAttribute("error");
    this.setAttribute("ready", "");
    this.updateWaitingState(true);
  }

  renderError() {
    if (this.hasAttribute("ready") || this.hasAttribute("error")) return;
    const template = this.querySelector(":scope > template[data-error-template]");
    if (template) this.renderTemplate(template);
    this.setAttribute("error", "");
    this.updateWaitingState(true);
  }

  renderTemplate(template) {
    this.clearRenderedNodes();
    const fragment = template.content.cloneNode(true);
    this._renderedNodes.push(...fragment.childNodes);
    template.before(fragment);
  }

  updateWaitingState(hidden) {
    const waiting = this.querySelector(":scope > [data-version-waiting]");
    if (waiting) waiting.hidden = hidden;
  }

  reportError(code, error) {
    this.renderError();
    this.dispatchEvent(
      new CustomEvent("flow:error", {
        bubbles: true,
        detail: { component: "flow-version-ready", code, error },
      }),
    );
  }

  clearRenderedNodes() {
    for (const node of this._renderedNodes) node.remove();
    this._renderedNodes = [];
  }
}

if (!customElements.get("flow-version-ready")) {
  customElements.define("flow-version-ready", FlowVersionReady);
}
