import { ReceiveResourceOS } from "./ReceiveResourceOS.js";
import DOMPurify from "./vendor/DOMPurify-3.4.14.es.mjs";

const ALLOWED_TAGS = [
  "p", "br", "span", "a", "strong", "em", "code", "ul", "ol", "li", "blockquote",
];
const ALLOWED_ATTR = ["href", "class", "translate", "title", "aria-label"];

function isSafeHttpUrl(value, baseUri) {
  try {
    const url = new URL(value, baseUri);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function sanitizedContentFragment(html, baseUri, purifier) {
  const fragment = purifier.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });

  for (const anchor of fragment.querySelectorAll("a")) {
    const href = anchor.getAttribute("href");
    if (!href || !isSafeHttpUrl(href, baseUri)) {
      anchor.removeAttribute("href");
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
      continue;
    }
    anchor.href = new URL(href, baseUri).href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }

  return fragment;
}

/**
 * Renders one RDF HTML literal through an explicit DOMPurify policy.
 *
 * @customElement flow-sanitized-content
 * @attr {string} predicate - RDF predicate containing the rich-content literal.
 * @dependency Inherits its RDF resource through PodOS and uses DOMPurify 3.4.14.
 * @slot - A direct `template[data-error-template]` rendered after failure.
 * @fires flow:error - Code `content-sanitization-failed`.
 * @example <flow-sanitized-content predicate="https://www.w3.org/ns/activitystreams#content"></flow-sanitized-content>
 */
export class FlowSanitizedContent extends ReceiveResourceOS {
  connectedCallback() {
    if (!this._errorContent) {
      const errorTemplate = this.querySelector(
        ":scope > template[data-error-template]",
      );
      this._errorContent = errorTemplate?.content.cloneNode(true) || null;
    }
    super.connectedCallback();
  }

  disconnectedCallback() {
    clearTimeout(this._osTimer);
  }

  update() {
    if (!this.resource?.uri) return false;
    const predicate = this.getAttribute("predicate");
    if (!predicate) {
      this.reportError(new Error("flow-sanitized-content requires predicate."));
      return false;
    }

    try {
      const html = this.resource.anyValue(predicate) || "";
      this.replaceChildren(
        sanitizedContentFragment(html, this.resource.uri, DOMPurify),
      );
      this.removeAttribute("error");
      this.setAttribute("ready", "");
      return true;
    } catch (error) {
      this.reportError(error);
      return false;
    }
  }

  reportError(error) {
    this.removeAttribute("ready");
    this.setAttribute("error", "");
    const errorContent = this._errorContent?.cloneNode(true);
    if (errorContent) this.replaceChildren(errorContent);
    else this.replaceChildren();
    this.dispatchEvent(
      new CustomEvent("flow:error", {
        bubbles: true,
        detail: {
          component: "flow-sanitized-content",
          code: "content-sanitization-failed",
          error,
        },
      }),
    );
  }
}

if (!customElements.get("flow-sanitized-content")) {
  customElements.define("flow-sanitized-content", FlowSanitizedContent);
}
