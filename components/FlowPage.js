const flowPageTemplatePromise = fetch("/templates/pages/flow-page.html")
  .then(response => {
    if (!response.ok) {
      throw new Error(
        `Failed to load Flow page template: ${response.status}`
      );
    }

    return response.text();
  });

function getPageUri() {
  const url = new URL(window.location.href);

  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1"
  ) {
    return new URL(
      url.pathname,
      "https://flowcoop.eu"
    ).href;
  }

  return url.href;
}

class FlowPage extends HTMLElement {
  async connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;

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

    const content = template.content.querySelector("[data-flow-content]");

    if (!content) {
      throw new Error(
        "Flow page template must contain <div data-flow-content></div>"
      );
    }

    content.replaceWith(pageContent);
    this.replaceChildren(template.content);
  }
}

if (!customElements.get("flow-page")) {
  customElements.define("flow-page", FlowPage);
}