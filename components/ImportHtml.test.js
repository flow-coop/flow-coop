// @vitest-environment happy-dom
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { validatedTemplateFragment } from "./ImportHtml.js";

const SOURCE_URL = "https://flowcoop.eu/templates/x.html";

const TRUSTED = [
  "boost-component",
  "flow-collection-pages",
  "flow-close-toggle",
  "flow-fediverse-interaction",
  "flow-if-open",
  "flow-sanitized-content",
  "flow-version-context",
  "import-html",
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
];

const FORBIDDEN = [
  "script",
  "iframe",
  "object",
  "embed",
  "base",
  "form",
  "svg",
  "math",
];

const UNKNOWN_CUSTOM = [
  "made-up-element",
  "flow-typo",
  "random-tag",
];

describe("validatedTemplateFragment — trusted custom elements", () => {
  it.each(TRUSTED)("accepts <%s>", (tag) => {
    expect(() =>
      validatedTemplateFragment(`<${tag}></${tag}>`, SOURCE_URL),
    ).not.toThrow();
  });

  it.each(UNKNOWN_CUSTOM)("rejects unknown custom element <%s>", (tag) => {
    expect(() =>
      validatedTemplateFragment(`<${tag}></${tag}>`, SOURCE_URL),
    ).toThrow(/untrusted/);
  });
});

describe("validatedTemplateFragment — forbidden elements", () => {
  it.each(FORBIDDEN)("rejects <%s>", (tag) => {
    expect(() =>
      validatedTemplateFragment(`<${tag}></${tag}>`, SOURCE_URL),
    ).toThrow(/forbidden/);
  });
});