import DOMPurify from "./vendor/DOMPurify-3.4.14.es.mjs";
import {
  componentRegistry,
  isAllowedCustomAttribute,
  trustedCustomElements,
} from "./registry.js";

const ALLOWED_NATIVE_ELEMENTS = new Set([
  "a", "article", "blockquote", "br", "button", "code", "dd", "details",
  "dialog", "div", "dl", "dt", "em", "footer", "h1", "h2", "h3", "h4",
  "header", "input", "label", "li", "main", "ol", "p", "section", "span",
  "strong", "summary", "template", "ul",
]);
const FORBIDDEN_ELEMENTS = new Set([
  "audio", "base", "canvas", "embed", "form", "frame", "frameset", "iframe",
  "link", "math", "meta", "object", "script", "source", "style", "svg",
  "track", "video",
]);
const URL_ATTRIBUTES = new Set([
  "action", "formaction", "href", "poster", "src", "xlink:href",
]);
const CUSTOM_URL_ATTRIBUTES = new Set([
  "if-property", "if-typeof", "predicate", "provenance-uri", "rel", "uri",
]);
const GLOBAL_ATTRIBUTES = new Set(["class", "hidden", "id", "role", "title"]);
const NATIVE_ATTRIBUTES = Object.freeze({
  a: new Set(["href", "rel", "target"]),
  button: new Set(["disabled", "type"]),
  details: new Set(["open"]),
  input: new Set([
    "autocomplete", "disabled", "inputmode", "placeholder", "spellcheck", "type",
  ]),
});
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
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
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

function allowedAttribute(element, name) {
  if (
    GLOBAL_ATTRIBUTES.has(name) ||
    name.startsWith("aria-") ||
    name.startsWith("data-")
  ) {
    return true;
  }
  if (element.localName.includes("-")) {
    return isAllowedCustomAttribute(element.localName, name);
  }
  return NATIVE_ATTRIBUTES[element.localName]?.has(name) || false;
}

function elementsIn(fragment) {
  const elements = [];
  for (const element of fragment.querySelectorAll("*")) {
    elements.push(element);
    if (element.localName === "template") {
      elements.push(...elementsIn(element.content));
    }
  }
  return elements;
}

export function validatedTemplateFragment(html, sourceUrl, purifier = DOMPurify) {
  const template = document.createElement("template");
  template.innerHTML = html;

  for (const element of elementsIn(template.content)) {
    if (FORBIDDEN_ELEMENTS.has(element.localName)) {
      throw new Error(`Template contains forbidden <${element.localName}>.`);
    }
    if (
      element.localName.includes("-") &&
      !trustedCustomElements.has(element.localName)
    ) {
      throw new Error(`Template contains untrusted <${element.localName}>.`);
    }
    if (
      !element.localName.includes("-") &&
      !ALLOWED_NATIVE_ELEMENTS.has(element.localName)
    ) {
      throw new Error(`Template contains unsupported <${element.localName}>.`);
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
      if (!allowedAttribute(element, name)) {
        throw new Error(
          `Template contains unsupported ${attribute.name} on <${element.localName}>.`,
        );
      }
      const isUrl =
        URL_ATTRIBUTES.has(name) ||
        (element.localName.includes("-") && CUSTOM_URL_ATTRIBUTES.has(name));
      if (isUrl && !safeUrl(attribute.value, sourceUrl)) {
        throw new Error(`Template contains an unsafe ${attribute.name} URL.`);
      }
    }
  }

  const customAttributes = Object.values(componentRegistry)
    .flatMap(entry => entry.attributes);
  return purifier.sanitize(html, {
    ADD_ATTR: [...new Set(customAttributes)],
    ADD_TAGS: [...trustedCustomElements],
    ALLOWED_TAGS: [...ALLOWED_NATIVE_ELEMENTS, ...trustedCustomElements],
    ALLOW_DATA_ATTR: true,
    RETURN_DOM_FRAGMENT: true,
  });
}

/**
 * Fetches and sanitizes a same-origin declarative HTML template.
 *
 * @customElement import-html
 * @attr {string} src - A same-origin URL below /templates/.
 * @slot - A direct `template[data-error-template]` rendered after failure.
 * @dependency DOMPurify 3.4.14 and the trusted component registry.
 * @fires flow:error - Code `template-load-failed`; includes technical details.
 * @example <import-html src="/templates/pages/home.html"><template data-error-template><p role="alert">Page unavailable.</p></template></import-html>
 */
export class ImportHtml extends HTMLElement {
  static observedAttributes = ["src"];

  connectedCallback() {
    if (!this._errorContent) {
      const errorTemplate = this.querySelector(
        ":scope > template[data-error-template]",
      );
      this._errorContent = errorTemplate?.content.cloneNode(true) || null;
    }
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
      const errorContent = this._errorContent?.cloneNode(true);
      if (errorContent) this.replaceChildren(errorContent);
      else this.replaceChildren();
      this.dispatchEvent(
        new CustomEvent("flow:error", {
          bubbles: true,
          detail: {
            component: "import-html",
            code: "template-load-failed",
            error,
          },
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
