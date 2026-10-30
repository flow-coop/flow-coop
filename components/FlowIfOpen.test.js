// @vitest-environment happy-dom
// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockOs, mockThing } from "./_test-harness.js";
import "./FlowIfOpen.js";

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function mountFlowIfOpen({ resourceUri, usedUris = new Set() } = {}) {
  const host = document.createElement("div");
  host.innerHTML = `<flow-if-open uri="${resourceUri}"><template></template></flow-if-open>`;
  document.body.appendChild(host);
  const element = host.querySelector("flow-if-open");

  const mockOs = createMockOs();
  mockOs.store.get.mockImplementation((uri) => mockThing(uri));
  element.os = mockOs;

  element.requestVersionContext = vi.fn().mockResolvedValue({ usedUris });

  return { element, host };
}

describe("FlowIfOpen", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("sets the open attribute when the resource URI is not in usedUris", async () => {
    const { element } = mountFlowIfOpen({
      resourceUri: "https://example.test/notes/1",
      usedUris: new Set(["https://example.test/notes/2"]),
    });
    await element.evaluate("https://example.test/notes/1", ++element._generation);
    expect(element.hasAttribute("open")).toBe(true);
    expect(element.hasAttribute("closed")).toBe(false);
  });

  it("sets the closed attribute when the resource URI is in usedUris", async () => {
    const uri = "https://example.test/notes/used";
    const { element } = mountFlowIfOpen({
      resourceUri: uri,
      usedUris: new Set([uri]),
    });
    await element.evaluate(uri, ++element._generation);
    expect(element.hasAttribute("closed")).toBe(true);
    expect(element.hasAttribute("open")).toBe(false);
  });

  it("matches the resource URI exactly (no as:url aliasing)", async () => {
    const noteUri = "https://mastodon.social/users/jg10/statuses/123";
    const asUrl = "https://mastodon.social/@jg10/123";
    const { element } = mountFlowIfOpen({
      resourceUri: noteUri,
      usedUris: new Set([asUrl]),
    });
    await element.evaluate(noteUri, ++element._generation);
    expect(element.hasAttribute("open")).toBe(true);
    expect(element.hasAttribute("closed")).toBe(false);
  });

  it("dispatches flow:open-state with the resource URI and the open flag", async () => {
    const uri = "https://example.test/notes/3";
    const { element, host } = mountFlowIfOpen({
      resourceUri: uri,
      usedUris: new Set(),
    });
    const dispatched = vi.fn();
    host.addEventListener("flow:open-state", dispatched);
    await element.evaluate(uri, ++element._generation);
    const event = dispatched.mock.calls[0]?.[0];
    expect(event).toBeDefined();
    expect(event.detail).toEqual({ uri, open: true });
  });

  it("dispatches flow:open-state with open=false when URI is in usedUris", async () => {
    const uri = "https://example.test/notes/used";
    const { element, host } = mountFlowIfOpen({
      resourceUri: uri,
      usedUris: new Set([uri]),
    });
    const dispatched = vi.fn();
    host.addEventListener("flow:open-state", dispatched);
    await element.evaluate(uri, ++element._generation);
    const event = dispatched.mock.calls[0]?.[0];
    expect(event.detail).toEqual({ uri, open: false });
  });

  it("ignores stale generations", async () => {
    const { element } = mountFlowIfOpen({
      resourceUri: "https://example.test/notes/x",
      usedUris: new Set(),
    });
    element._generation = 5;
    await element.evaluate("https://example.test/notes/x", 4);
    expect(element.hasAttribute("open")).toBe(false);
  });

  it("sets error attribute when requestVersionContext rejects", async () => {
    const { element } = mountFlowIfOpen({
      resourceUri: "https://example.test/notes/err",
    });
    element.requestVersionContext = vi.fn().mockRejectedValue(new Error("boom"));
    await element.evaluate("https://example.test/notes/err", ++element._generation);
    expect(element.hasAttribute("error")).toBe(true);
    expect(element.hasAttribute("loading")).toBe(false);
    expect(element.hasAttribute("open")).toBe(false);
    expect(element.hasAttribute("closed")).toBe(false);
  });
});
