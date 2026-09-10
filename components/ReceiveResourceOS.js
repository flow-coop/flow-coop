export class ReceiveResourceOS extends HTMLElement {
  receiveResource = async resource => {
    if (!resource || !resource.uri) return false;
    this.resource = resource;
    this.update();
    return true;
  };
  setOs = async os => {
    this.os = os;
    let hasResource = await this.receiveResource(this.resource);
    if (!hasResource) this.update();
  };
  connectedCallback() {
    this.init();
  }
  init() {
    let ev = new CustomEvent("pod-os:resource", {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: this.receiveResource
    });
    this.dispatchEvent(ev);
    let ev2 = new CustomEvent("pod-os:init", {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: this.setOs
    });
    this.dispatchEvent(ev2);
    clearTimeout(this._osTimer);
    this._osTimer = setTimeout(() => {
      if (typeof this.os == "undefined") {
        this.init();
      }
    }, 50);
  }
  update() {
    return true;
  }
}
