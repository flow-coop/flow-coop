const FORBIDDEN_ELEMENTS = [
  "script", "iframe", "object", "embed", "base", "form", "svg", "math",
  "meta[http-equiv]", "link",
];
const URL_ATTRIBUTES = new Set([
  "action", "formaction", "href", "poster", "src", "xlink:href",
]);
const TRUSTED_CUSTOM_ELEMENTS = new Set([
  "boost-component",
  "flow-collection-pages",
  "flow-fediverse-interaction",
  "flow-if-open",
  "flow-sanitized-content",
  "flow-version-context",
  "import-html",
  "ion-badge",
  "ion-button",
  "ion-card",
  "ion-card-content",
  "ion-card-header",
  "ion-card-subtitle",
  "ion-chip",
  "ion-list",
  "pos-app",
  "pos-case",
  "pos-label",
  "pos-list",
  "pos-login",
  "pos-rich-link",
  "pos-router",
  "pos-switch",
  "pos-type-badges",
  "pos-value",
  "webid-resource",
]);
const TEMPLATE_REQUESTS = new Map();
const REQUEST_ABORT_GRACE_MS = 250;

function templateUrl(value) {
  if (!value) throw new Error("import-html requires src.");
  const url = new URL(value, window.location.href);
  if (
    url.origin !== window.location.origin ||
    !url.pathname.startsWith("/templates/") ||
    !url.pathname.endsWith(".html")
  ) {
    throw new Error("Templates must be same-origin /templates/*.html resources.");
  }
  return url;
}

function safeUrl(value, sourceUrl) {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("#")) return true;
  try {
    const url = new URL(value, sourceUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function acquireTemplate(url, subscriber) {
  let request = TEMPLATE_REQUESTS.get(url.href);
  if (!request) {
    const controller = new AbortController();
    request = {
      abortTimer: null,
      controller,
      settled: false,
      subscribers: new Set(),
      promise: null,
    };
    request.promise = fetch(url.href, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`Template request failed: HTTP ${response.status}.`);
        }
        return await response.text();
      })
      .then(html => {
        if (request.abortTimer !== null) clearTimeout(request.abortTimer);
        request.settled = true;
        return html;
      })
      .catch(error => {
        if (request.abortTimer !== null) clearTimeout(request.abortTimer);
        TEMPLATE_REQUESTS.delete(url.href);
        throw error;
      });
    TEMPLATE_REQUESTS.set(url.href, request);
  }
  if (request.abortTimer !== null) {
    clearTimeout(request.abortTimer);
    request.abortTimer = null;
  }
  request.subscribers.add(subscriber);
  return request.promise;
}

function releaseTemplate(url, subscriber) {
  const request = TEMPLATE_REQUESTS.get(url);
  if (!request) return;
  request.subscribers.delete(subscriber);
  if (request.subscribers.size !== 0 || request.settled || request.abortTimer !== null) return;
  request.abortTimer = setTimeout(() => {
    request.abortTimer = null;
    if (request.subscribers.size !== 0 || request.settled) return;
    request.controller.abort();
    TEMPLATE_REQUESTS.delete(url);
  }, REQUEST_ABORT_GRACE_MS);
}

export function validatedTemplateFragment(html, sourceUrl) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const forbidden = template.content.querySelector(FORBIDDEN_ELEMENTS.join(","));
  if (forbidden) {
    throw new Error(`Template contains forbidden <${forbidden.localName}>.`);
  }

  for (const element of template.content.querySelectorAll("*")) {
    if (
      element.localName.includes("-") &&
      !TRUSTED_CUSTOM_ELEMENTS.has(element.localName)
    ) {
      throw new Error(`Template contains untrusted <${element.localName}>.`);
    }
    if (
      element.localName === "style" &&
      /(?:@import|url\s*\(|expression\s*\(|behavior\s*:)/iu.test(
        element.textContent,
      )
    ) {
      throw new Error("Template contains unsafe stylesheet content.");
    }
    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith("on") ||
        name === "srcdoc" ||
        name === "is" ||
        name === "shadowrootmode"
      ) {
        throw new Error(`Template contains forbidden ${attribute.name} attribute.`);
      }
      if (
        name === "style" &&
        /(?:url|expression|behavior)\s*\(/iu.test(attribute.value)
      ) {
        throw new Error("Template contains an unsafe style attribute.");
      }
      if (URL_ATTRIBUTES.has(name) && !safeUrl(attribute.value, sourceUrl)) {
        throw new Error(`Template contains an unsafe ${attribute.name} URL.`);
      }
    }
  }

  return template.content.cloneNode(true);
}

export class ImportHtml extends HTMLElement {
  static observedAttributes = ["src"];

  connectedCallback() {
    void this.load();
  }

  disconnectedCallback() {
    this._generation = (this._generation || 0) + 1;
    this.releaseRequest();
  }

  attributeChangedCallback() {
    if (this.isConnected) void this.load();
  }

  async load() {
    this.releaseRequest();
    const generation = (this._generation || 0) + 1;
    this._generation = generation;
    this.removeAttribute("error");
    this.setAttribute("loading", "");

    try {
      const url = templateUrl(this.getAttribute("src"));
      const subscriber = Symbol("import-html");
      this._request = { url: url.href, subscriber };
      const html = await acquireTemplate(url, subscriber);
      if (generation !== this._generation) return;
      this.releaseRequest();
      const fragment = validatedTemplateFragment(html, url);
      this.replaceChildren(fragment);
      this.removeAttribute("loading");
      this.setAttribute("ready", "");
    } catch (error) {
      if (generation !== this._generation || error?.name === "AbortError") return;
      this.releaseRequest();
      this.removeAttribute("loading");
      this.removeAttribute("ready");
      this.setAttribute("error", "");
      const message = document.createElement("p");
      message.dataset.templateError = "";
      message.setAttribute("role", "alert");
      message.textContent = `Template unavailable: ${error.message}`;
      this.replaceChildren(message);
      this.dispatchEvent(
        new CustomEvent("flow:error", {
          bubbles: true,
          detail: { component: "import-html", error },
        }),
      );
    }
  }

  releaseRequest() {
    if (!this._request) return;
    releaseTemplate(this._request.url, this._request.subscriber);
    this._request = null;
  }
}

if (!customElements.get("import-html")) {
  customElements.define("import-html", ImportHtml);
}
