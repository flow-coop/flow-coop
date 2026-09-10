import { ReceiveResourceOS } from "./ReceiveResourceOS.js";

const ALLOWED_TAGS = [
  "p", "br", "span", "a", "strong", "em", "code", "ul", "ol", "li", "blockquote",
];
const ALLOWED_ATTR = ["href", "class", "translate", "title", "aria-label"];

function isSafeHttpUrl(value, baseUri) {
  try {
    const url = new URL(value, baseUri);
    return url.protocol === "http:" || url.protocol === "https:";
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

export class FlowSanitizedContent extends ReceiveResourceOS {
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
      const purifier = globalThis.DOMPurify;
      if (!purifier?.sanitize) throw new Error("DOMPurify is not available.");
      const html = this.resource.anyValue(predicate) || "";
      this.replaceChildren(
        sanitizedContentFragment(html, this.resource.uri, purifier),
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
    this.replaceChildren();
    this.dispatchEvent(
      new CustomEvent("flow:error", {
        bubbles: true,
        detail: { component: "flow-sanitized-content", error },
      }),
    );
  }
}

if (!customElements.get("flow-sanitized-content")) {
  customElements.define("flow-sanitized-content", FlowSanitizedContent);
}
