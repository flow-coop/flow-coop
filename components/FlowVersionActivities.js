import { requestVersionContext } from "./requestVersionContext.js";

/**
 * Instantiates authored markup once for each current generating activity.
 *
 * @customElement flow-version-activities
 * @dependency Requires an ancestor `flow-version-context` and reads its
 * resolved `directActivityUris` through `flow:request-version-context`.
 * @slot - A direct template containing one `[data-version-activity]` resource
 * host, plus optional authored `[data-empty]` and `[data-error]` states.
 * @fires flow:error - Code `version-activities-failed` reports missing context,
 * malformed templates, or failed context resolution.
 * @example <flow-version-activities><template><pos-resource data-version-activity></pos-resource></template><p data-empty hidden>No changes.</p></flow-version-activities>
 */
export class FlowVersionActivities extends HTMLElement {
  constructor() {
    super();
    this._generation = 0;
    this._renderedNodes = [];
  }

  connectedCallback() {
    void this.render(++this._generation);
  }

  disconnectedCallback() {
    this._generation = (this._generation || 0) + 1;
    this.clearRenderedNodes();
  }

  async render(generation) {
    this.removeAttribute("ready");
    this.removeAttribute("error");
    this.setAttribute("loading", "");
    this.updateStates();

    try {
      const context = await requestVersionContext(this);
      if (generation !== this._generation) return;
      const template = this.querySelector(":scope > template");
      if (!template) {
        throw new Error("flow-version-activities requires a direct template.");
      }

      this.clearRenderedNodes();
      for (const activityUri of new Set(context.directActivityUris || [])) {
        const fragment = template.content.cloneNode(true);
        const resource = fragment.querySelector("[data-version-activity]");
        if (!resource) {
          throw new Error(
            "flow-version-activities requires a data-version-activity resource.",
          );
        }
        resource.setAttribute("uri", activityUri);
        const nodes = [...fragment.childNodes];
        template.before(fragment);
        this._renderedNodes.push(...nodes);
      }
      this.removeAttribute("loading");
      this.setAttribute("ready", "");
      this.updateStates();
    } catch (error) {
      if (generation !== this._generation) return;
      this.clearRenderedNodes();
      this.removeAttribute("loading");
      this.setAttribute("error", "");
      this.updateStates();
      this.dispatchEvent(
        new CustomEvent("flow:error", {
          bubbles: true,
          detail: {
            component: "flow-version-activities",
            code: "version-activities-failed",
            error,
          },
        }),
      );
    }
  }

  updateStates() {
    const empty = this.querySelector(":scope > [data-empty]");
    const error = this.querySelector(":scope > [data-error]");
    if (empty) {
      empty.hidden =
        !this.hasAttribute("ready") || this._renderedNodes.length !== 0;
    }
    if (error) error.hidden = !this.hasAttribute("error");
  }

  clearRenderedNodes() {
    for (const node of this._renderedNodes || []) node.remove();
    this._renderedNodes = [];
  }
}

if (!customElements.get("flow-version-activities")) {
  customElements.define("flow-version-activities", FlowVersionActivities);
}
