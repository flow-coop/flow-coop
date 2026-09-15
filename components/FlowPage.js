export class FlowPage extends HTMLElement {
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    const uri = this.getAttribute("uri");

    const content = document.createDocumentFragment();

    while (this.firstChild) {
      content.append(this.firstChild);
    }

    const ionContent = document.createElement("ion-content");
    const posApp = document.createElement("pos-app");
    const posRouter = document.createElement("pos-router");
    const versionContext = document.createElement("flow-version-context");
    const main = document.createElement("main");

    posRouter.setAttribute("mode", "pod");
    versionContext.setAttribute("uri", uri);
    main.className = "flow-topic-shell";

    main.append(content);
    versionContext.append(main);
    posRouter.append(versionContext);
    posApp.append(posRouter);
    ionContent.append(posApp);

    this.append(ionContent);
  }
}

customElements.define("flow-page", FlowPage);