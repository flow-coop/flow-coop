import { ReceiveResourceOS } from "./ReceiveResourceOS.js";
import { currentMonthChangelogUrl } from "./currentMonthChangelogUrl.js";

const PROV_USED = "http://www.w3.org/ns/prov#used";
const SOLID = "http://www.w3.org/ns/solid/terms#";
const SHARD_SUBJECT = "<#current>";

export class FlowCloseToggle extends ReceiveResourceOS {
  constructor() {
    super();
    this._patchSub = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._subscribePatchTarget();
    this._render();
  }

  disconnectedCallback() {
    clearTimeout(this._osTimer);
    this._patchSub?.unsubscribe();
    this._patchSub = null;
  }

  set resource(value) {
    this._resource = value;
    this._render();
  }

  get resource() {
    return this._resource;
  }

  set os(value) {
    this._setOs(value);
  }

  get os() {
    return this._os;
  }

  _setOs(os) {
    this._os = os;
    if (this._resource) {
      this._render();
      return;
    }
    this._render();
    Promise.resolve(this.receiveResource(this._resource)).then((hasResource) => {
      if (hasResource) this._render();
    });
  }

  receiveResource = async (resource) => {
    if (!resource || !resource.uri) return false;
    this._resource = resource;
    this._render();
    return true;
  };

  update() {
    this._render();
    return true;
  }

  _patchUrl() {
    return currentMonthChangelogUrl(this.baseURI);
  }

  _isWritable() {
    if (!this._os) return false;
    return Boolean(this._os.store.get(this._patchUrl()).editable);
  }

  _subscribePatchTarget() {
    if (!this._os || this._patchSub) return;
    const url = this._patchUrl();
    const target = this._os.store.get(url);
    this._patchSub = target
      .observeChanges({
        filterFn: (quad) =>
          quad.subject.value === url || quad.object.value === url,
        observes: () => this._os.store.get(url).editable,
        compare: (a, b) => a === b,
      })
      .subscribe(() => this._render());
  }

  _render() {
    this._subscribePatchTarget();
    if (!this._isWritable()) {
      this.replaceChildren();
      return;
    }
    const closed = this.hasAttribute("closed");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "flow-link-button";
    button.textContent = closed ? "Reopen comment" : "Close comment";
    if (!this._resource?.uri) {
      this.setAttribute("error", "missing-uri");
      button.disabled = true;
    } else {
      this.removeAttribute("error");
      button.addEventListener("click", () => this._toggle());
    }
    this.replaceChildren(button);
  }

  _toggle() {
    const wasClosed = this.hasAttribute("closed");
    const willClose = !wasClosed;
    this.toggleAttribute("closed", willClose);
    this._render();

    void (async () => {
      const patchUrl = this._patchUrl();
      const body = willClose ? this._insertsBody() : this._deletesBody();
      try {
        const response = await this._os.session.authenticatedFetch(patchUrl, {
          method: "PATCH",
          headers: { "Content-Type": "text/n3" },
          body,
        });
        if (response.status < 200 || response.status >= 300) {
          this._rollback(wasClosed);
          this._reportError(`PATCH failed with status ${response.status}`);
          return;
        }
        this.dispatchEvent(
          new CustomEvent("flow:open-state", {
            bubbles: true,
            detail: { uri: this._resource.uri, open: !willClose },
          }),
        );
      } catch (error) {
        this._rollback(wasClosed);
        this._reportError(error?.message ?? String(error));
      }
    })();
  }

  _insertsBody() {
    return `@prefix solid: <${SOLID}>.\n` +
      `@prefix prov: <${PROV_USED}>.\n\n` +
      `_:patch a solid:InsertDeletePatch;\n` +
      `    solid:inserts { ${SHARD_SUBJECT} prov:used <${this._resource.uri}> . }.`;
  }

  _deletesBody() {
    return `@prefix solid: <${SOLID}>.\n` +
      `@prefix prov: <${PROV_USED}>.\n\n` +
      `_:patch a solid:InsertDeletePatch;\n` +
      `    solid:deletes { ${SHARD_SUBJECT} prov:used <${this._resource.uri}> . }.`;
  }

  _rollback(wasClosed) {
    this.toggleAttribute("closed", wasClosed);
    this._render();
  }

  _reportError(message) {
    this.setAttribute("error", message);
    this.dispatchEvent(
      new CustomEvent("flow:error", {
        bubbles: true,
        detail: { component: "flow-close-toggle", error: new Error(message) },
      }),
    );
  }
}

if (!customElements.get("flow-close-toggle")) {
  customElements.define("flow-close-toggle", FlowCloseToggle);
}