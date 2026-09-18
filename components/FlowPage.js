const flowPageTemplatePromise = fetch("/templates/pages/flow-page.html")
  .then(response => {
    if (!response.ok) {
      throw new Error(
        `Failed to load Flow page template: ${response.status}`
      );
    }

    return response.text();
  });

class FlowPage extends HTMLElement {
  async connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;

    const pageUri = window.location.href;
    const thingUri = new URL("index.ttl#it", pageUri).href;

    /*
     * Move the page-specific content out of <flow-page> while
     * the shared page structure is assembled.
     *
     * This avoids cloning, serializing or re-parsing the page content.
     */
    const pageContent = document.createDocumentFragment();
    pageContent.append(...this.childNodes);
    const html = await flowPageTemplatePromise;
    const template = document.createElement("template");
    template.innerHTML = html;

    /*
     * The version context operates on the page/container URI.
     */
    const versionContext =
      template.content.querySelector("flow-version-context");

    if (!versionContext) {
      throw new Error(
        "Flow page template must contain <flow-version-context>"
      );
    }

    versionContext.setAttribute("uri", pageUri);

    /*
     * Resources representing the page/container itself.
     */
    template.content
      .querySelectorAll("[data-page-resource]")
      .forEach(resource => {
        resource.setAttribute("uri", pageUri);
      });

    /*
     * The main page thing is index.ttl#it.
     *
     * This provides the resource context for both the page-specific
     * content and the discussion.
     */
    const pageThing =
      template.content.querySelector("[data-page-thing]");

    if (!pageThing) {
      throw new Error(
        "Flow page template must contain [data-page-thing]"
      );
    }

    pageThing.setAttribute("uri", thingUri);

    const content =
      template.content.querySelector("flow-content");

    if (!content) {
      throw new Error(
        "Flow page template must contain <flow-content>"
      );
    }

    content.replaceWith(pageContent);
    this.replaceChildren(template.content);
  }
}

if (!customElements.get("flow-page")) {
  customElements.define("flow-page", FlowPage);
}