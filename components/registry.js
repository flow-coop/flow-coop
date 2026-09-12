const commonAttributes = ["class", "hidden", "id", "role"];

/**
 * The single trust boundary for custom elements allowed in imported templates.
 * Platform providers are bootstrapped eagerly; Flow modules are loaded on demand.
 */
export const componentRegistry = Object.freeze({
  "flow-collection-pages": {
    provider: "flow",
    module: "./FlowCollectionPages.js",
    attributes: [...commonAttributes, "max-pages"],
  },
  "flow-fediverse-interaction": {
    provider: "flow",
    module: "./FlowFediverseInteraction.js",
    attributes: [...commonAttributes, "mode"],
  },
  "flow-if-open": {
    provider: "flow",
    module: "./FlowIfOpen.js",
    attributes: [...commonAttributes, "uri"],
  },
  "flow-sanitized-content": {
    provider: "flow",
    module: "./FlowSanitizedContent.js",
    attributes: [...commonAttributes, "predicate"],
  },
  "flow-version-context": {
    provider: "flow",
    module: "./FlowVersionContext.js",
    attributes: [...commonAttributes, "provenance-uri", "uri"],
  },
  "import-html": {
    provider: "flow-bootstrap",
    module: "./ImportHtml.js",
    attributes: [...commonAttributes, "src"],
  },
  "ion-badge": {
    provider: "ionic@9.0.0",
    module: null,
    attributes: [...commonAttributes, "color"],
  },
  "ion-chip": {
    provider: "ionic@9.0.0",
    module: null,
    attributes: commonAttributes,
  },
  "pos-app-document-viewer": {
    provider: "@pod-os/elements@0.43.0",
    module: null,
    attributes: commonAttributes,
  },
  "pos-case": {
    provider: "@pod-os/elements@0.43.0",
    module: null,
    attributes: [...commonAttributes, "else", "if-property", "if-typeof"],
  },
  "pos-description": {
    provider: "@pod-os/elements@0.43.0",
    module: null,
    attributes: commonAttributes,
  },
  "pos-label": {
    provider: "@pod-os/elements@0.43.0",
    module: null,
    attributes: commonAttributes,
  },
  "pos-list": {
    provider: "@pod-os/elements@0.43.0",
    module: null,
    attributes: [...commonAttributes, "fetch", "rel"],
  },
  "pos-resource": {
    provider: "@pod-os/elements@0.43.0",
    module: null,
    attributes: [...commonAttributes, "uri"],
  },
  "pos-rich-link": {
    provider: "@pod-os/elements@0.43.0",
    module: null,
    attributes: [...commonAttributes, "rel"],
  },
  "pos-switch": {
    provider: "@pod-os/elements@0.43.0",
    module: null,
    attributes: commonAttributes,
  },
  "pos-value": {
    provider: "@pod-os/elements@0.43.0",
    module: null,
    attributes: [...commonAttributes, "predicate"],
  },
});

export const trustedCustomElements = new Set(Object.keys(componentRegistry));

export function isAllowedCustomAttribute(tagName, attributeName) {
  const entry = componentRegistry[tagName];
  if (!entry) return false;
  return (
    entry.attributes.includes(attributeName) ||
    attributeName.startsWith("aria-") ||
    attributeName.startsWith("data-")
  );
}
