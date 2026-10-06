// @vitest-environment happy-dom
// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Subject } from "rxjs";
import { createMockOs, mockThing } from "./_test-harness.js";
import { currentMonthChangelogUrl } from "./currentMonthChangelogUrl.js";
import "./FlowCloseToggle.js";

const FIXED_DATE = new Date(Date.UTC(2026, 8, 15, 12, 0, 0));
const DRAFT_URL =
  "https://flowcoop.eu/topics/task_management/history/draft/";
const PATCH_URL = currentMonthChangelogUrl(DRAFT_URL, FIXED_DATE);
const NOTE_URI = "https://mastodon.social/users/jg10/statuses/1";

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

function makePatchSubject() {
  const subject = new Subject();
  return { subject, observable: subject };
}

function mountCloseToggle({ noteUri = NOTE_URI, fetchResponse, patchTarget } = {}) {
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

  const defaultPatchTarget = {
    editable: true,
    observeChanges: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  };
  const target = patchTarget ?? defaultPatchTarget;

  os.store.get.mockImplementation((uri) => {
    if (uri === PATCH_URL) {
      return { ...target, uri };
    }
    return mockThing(uri);
  });

  element.os = os;
  element.receiveResource(mockThing(noteUri));

  return { element, host, os, target };
}

describe("FlowCloseToggle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a button labelled 'Close comment'", () => {
    const { element } = mountCloseToggle();
    const button = element.querySelector("button");
    expect(button).not.toBeNull();
    expect(button.textContent.trim()).toBe("Close comment");
  });

  it("renders the button with class 'flow-link-button'", () => {
    const { element } = mountCloseToggle();
    const button = element.querySelector("button");
    expect(button.classList.contains("flow-link-button")).toBe(true);
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

  it("switches the button label to 'Reopen comment' when closed", async () => {
    const { element } = mountCloseToggle();
    element.querySelector("button").click();
    await flush();
    expect(element.querySelector("button").textContent.trim()).toBe(
      "Reopen comment",
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
    os.store.get.mockImplementation((uri) =>
      uri === PATCH_URL
        ? { uri, editable: true, observeChanges: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) }
        : mockThing(uri),
    );
    element.os = os;

    expect(element.hasAttribute("error")).toBe(true);
    const button = element.querySelector("button");
    button.click();
    expect(os.session.authenticatedFetch).not.toHaveBeenCalled();
  });
});

describe.each([
  { editable: false, label: "false" },
  { editable: undefined, label: "undefined (unfetched)" },
])("FlowCloseToggle writability gate — target.editable is $label", ({ editable }) => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_DATE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides the button (renders no button)", () => {
    const { element } = mountCloseToggle({
      patchTarget: {
        editable,
        observeChanges: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
      },
    });
    expect(element.querySelector("button")).toBeNull();
  });
});

describe("FlowCloseToggle — reactive re-render on patch target data", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_DATE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the button after editable flips from false to true", () => {
    const { subject, observable } = makePatchSubject();
    const patchTarget = {
      editable: false,
      observeChanges: () => observable,
    };
    const { element, target } = mountCloseToggle({ patchTarget });

    expect(element.querySelector("button")).toBeNull();

    target.editable = true;
    subject.next({});

    expect(element.querySelector("button")).not.toBeNull();
    expect(element.querySelector("button").textContent.trim()).toBe(
      "Close comment",
    );
  });

  it("hides the button after editable flips from true to false", () => {
    const { subject, observable } = makePatchSubject();
    const patchTarget = {
      editable: true,
      observeChanges: () => observable,
    };
    const { element, target } = mountCloseToggle({ patchTarget });

    expect(element.querySelector("button")).not.toBeNull();

    target.editable = false;
    subject.next({});

    expect(element.querySelector("button")).toBeNull();
  });

  it("unsubscribes on disconnect (no further re-renders)", () => {
    const unsubscribe = vi.fn();
    const { observable } = makePatchSubject();
    const subscribeReturning = {
      subscribe: vi.fn(() => ({ unsubscribe })),
    };
    const patchTarget = {
      editable: false,
      observeChanges: () => subscribeReturning,
    };
    const { element } = mountCloseToggle({ patchTarget });

    element.remove();
    document.body.innerHTML = "";

    expect(unsubscribe).toHaveBeenCalled();
  });
});