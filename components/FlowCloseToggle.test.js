// @vitest-environment happy-dom
// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMockOs, mockThing } from "./_test-harness.js";
import { currentMonthChangelogUrl } from "./currentMonthChangelogUrl.js";
import "./FlowCloseToggle.js";

const FIXED_DATE = new Date(Date.UTC(2026, 8, 15, 12, 0, 0));
const DRAFT_URL =
  "https://flowcoop.eu/topics/task_management/history/draft/";
const PATCH_URL = currentMonthChangelogUrl(DRAFT_URL, FIXED_DATE);
const NOTE_URI = "https://mastodon.social/users/jg10/statuses/1";

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function mountCloseToggle({ noteUri = NOTE_URI, fetchResponse } = {}) {
  const host = document.createElement("div");
  host.innerHTML = `<flow-close-toggle></flow-close-toggle>`;
  document.body.appendChild(host);
  const element = host.querySelector("flow-close-toggle");
  Object.defineProperty(element, "baseURI", {
    value: DRAFT_URL,
    configurable: true,
  });

  const os = createMockOs();
  if (fetchResponse) {
    os.session.authenticatedFetch.mockResolvedValue(fetchResponse);
  }
  os.store.get.mockImplementation((uri) => mockThing(uri));
  element.os = os;

  element.receiveResource(mockThing(noteUri));

  return { element, host, os };
}

describe("FlowCloseToggle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a button labelled 'Close for this draft'", () => {
    const { element } = mountCloseToggle();
    const button = element.querySelector("button");
    expect(button).not.toBeNull();
    expect(button.textContent.trim()).toBe("Close for this draft");
  });

  it("PATCHes solid:inserts { <#current> prov:used <uri> } on click", async () => {
    const { element, host, os } = mountCloseToggle();
    const dispatched = vi.fn();
    host.addEventListener("flow:open-state", dispatched);

    element.querySelector("button").click();
    await flush();

    expect(os.session.authenticatedFetch).toHaveBeenCalledWith(
      PATCH_URL,
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "Content-Type": "text/n3" }),
      }),
    );
    const [, options] = os.session.authenticatedFetch.mock.calls[0];
    expect(options.body).toContain("prov:used");
    expect(options.body).toContain(NOTE_URI);
    expect(options.body).toContain("solid:inserts");
  });

  it("optimistically flips the closed attribute before the PATCH resolves", () => {
    const { element } = mountCloseToggle();
    const button = element.querySelector("button");
    button.click();
    expect(element.hasAttribute("closed")).toBe(true);
  });

  it("dispatches flow:open-state with open=false on 2xx response", async () => {
    const { element, host } = mountCloseToggle({
      fetchResponse: { status: 200, ok: true },
    });
    const dispatched = vi.fn();
    host.addEventListener("flow:open-state", dispatched);

    element.querySelector("button").click();
    await flush();

    const event = dispatched.mock.calls[0]?.[0];
    expect(event).toBeDefined();
    expect(event.detail).toEqual({ uri: NOTE_URI, open: false });
  });

  it("rolls back closed attribute and sets error on non-2xx", async () => {
    const { element } = mountCloseToggle({
      fetchResponse: { status: 412, ok: false },
    });
    const dispatched = vi.fn();
    element.addEventListener("flow:open-state", dispatched);

    element.querySelector("button").click();
    await flush();

    expect(element.hasAttribute("closed")).toBe(false);
    expect(element.hasAttribute("error")).toBe(true);
    expect(dispatched).not.toHaveBeenCalled();
  });

  it("rolls back closed attribute and sets error when fetch throws", async () => {
    const { element, os } = mountCloseToggle();
    os.session.authenticatedFetch.mockRejectedValue(new Error("network"));
    const dispatched = vi.fn();
    element.addEventListener("flow:open-state", dispatched);

    element.querySelector("button").click();
    await flush();

    expect(element.hasAttribute("closed")).toBe(false);
    expect(element.hasAttribute("error")).toBe(true);
    expect(dispatched).not.toHaveBeenCalled();
  });

  it("switches the button label to 'Reopen for this draft' when closed", async () => {
    const { element } = mountCloseToggle();
    element.querySelector("button").click();
    await flush();
    expect(element.querySelector("button").textContent.trim()).toBe(
      "Reopen for this draft",
    );
  });

  it("sends solid:deletes on the second click (reopen)", async () => {
    const { element, os } = mountCloseToggle();
    const button = element.querySelector("button");

    button.click();
    await flush();
    expect(os.session.authenticatedFetch).toHaveBeenCalledTimes(1);

    button.click();
    await flush();
    expect(os.session.authenticatedFetch).toHaveBeenCalledTimes(2);
    const [, options] = os.session.authenticatedFetch.mock.calls[1];
    expect(options.body).toContain("solid:deletes");
    expect(options.body).not.toContain("solid:inserts");
  });

  it("does not PATCH and disables the button when resource is missing", () => {
    const host = document.createElement("div");
    host.innerHTML = `<flow-close-toggle></flow-close-toggle>`;
    document.body.appendChild(host);
    const element = host.querySelector("flow-close-toggle");
    Object.defineProperty(element, "baseURI", {
      value: DRAFT_URL,
      configurable: true,
    });
    const os = createMockOs();
    element.os = os;

    expect(element.hasAttribute("error")).toBe(true);
    const button = element.querySelector("button");
    button.click();
    expect(os.session.authenticatedFetch).not.toHaveBeenCalled();
  });
});
