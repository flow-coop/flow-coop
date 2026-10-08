// @vitest-environment happy-dom
// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BehaviorSubject } from "rxjs";
import { createMockOs, mockThing } from "./_test-harness.js";
import { currentMonthChangelogUrl } from "./currentMonthChangelogUrl.js";
import "./FlowCloseToggle.js";

const FIXED_DATE = new Date(Date.UTC(2026, 8, 15, 12, 0, 0));
const DRAFT_URL =
  "https://flowcoop.eu/topics/task_management/history/draft/";
const PATCH_URL = currentMonthChangelogUrl(DRAFT_URL, FIXED_DATE);
const NOTE_URI = "https://mastodon.social/users/jg10/statuses/1";
const WEB_ID = "https://example.com/profile#me";

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

async function mountCloseToggle(options = {}) {
  const {
    noteUri = NOTE_URI,
    fetchResponse,
    withResource = true,
    observeSession,
  } = options;
  const editable = "editable" in options ? options.editable : true;
  const host = document.createElement("div");
  host.innerHTML = `<flow-close-toggle></flow-close-toggle>`;
  document.body.appendChild(host);
  const element = host.querySelector("flow-close-toggle");
  Object.defineProperty(element, "baseURI", {
    value: DRAFT_URL,
    configurable: true,
  });

  const os = createMockOs();
  const sessionSubject = new BehaviorSubject({
    isLoggedIn: true,
    webId: WEB_ID,
  });
  os.observeSession = vi.fn(observeSession ?? (() => sessionSubject));
  if (fetchResponse) {
    os.session.authenticatedFetch.mockResolvedValue(fetchResponse);
  }

  const state = { editable };
  os.store.get.mockImplementation((uri) =>
    uri === PATCH_URL ? { uri, editable: state.editable } : mockThing(uri),
  );

  element.os = os;
  if (withResource) element.receiveResource(mockThing(noteUri));
  await flush();

  return { element, host, os, state, sessionSubject };
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

  it("renders a button labelled 'Close comment'", async () => {
    const { element } = await mountCloseToggle();
    const button = element.querySelector("button");
    expect(button).not.toBeNull();
    expect(button.textContent.trim()).toBe("Close comment");
  });

  it("renders the button with class 'flow-link-button'", async () => {
    const { element } = await mountCloseToggle();
    const button = element.querySelector("button");
    expect(button.classList.contains("flow-link-button")).toBe(true);
  });

  it("loads the changelog through the os store so it is authenticated", async () => {
    const { os } = await mountCloseToggle();
    expect(os.store.fetch).toHaveBeenCalledWith(PATCH_URL);
  });

  it("PATCHes solid:inserts { <#current> prov:used <uri> } on click", async () => {
    const { element, host, os } = await mountCloseToggle();
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

  it("optimistically flips the closed attribute before the PATCH resolves", async () => {
    const { element } = await mountCloseToggle();
    const button = element.querySelector("button");
    button.click();
    expect(element.hasAttribute("closed")).toBe(true);
  });

  it("dispatches flow:open-state with open=false on 2xx response", async () => {
    const { element, host } = await mountCloseToggle({
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
    const { element } = await mountCloseToggle({
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
    const { element, os } = await mountCloseToggle();
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
    const { element } = await mountCloseToggle();
    element.querySelector("button").click();
    await flush();
    expect(element.querySelector("button").textContent.trim()).toBe(
      "Reopen comment",
    );
  });

  it("sends solid:deletes on the second click (reopen)", async () => {
    const { element, os } = await mountCloseToggle();
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

  it("does not PATCH and disables the button when resource is missing", async () => {
    const { element, os } = await mountCloseToggle({ withResource: false });

    expect(element.hasAttribute("error")).toBe(true);
    const button = element.querySelector("button");
    button.click();
    expect(os.session.authenticatedFetch).not.toHaveBeenCalled();
  });
});

describe.each([
  { editable: false, label: "false" },
  { editable: undefined, label: "undefined (unfetched)" },
])(
  "FlowCloseToggle writability gate — target.editable is $label",
  ({ editable }) => {
    beforeEach(() => {
      document.body.innerHTML = "";
      vi.useFakeTimers();
      vi.setSystemTime(FIXED_DATE);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("hides the button (renders no button)", async () => {
      const { element } = await mountCloseToggle({ editable });
      expect(element.querySelector("button")).toBeNull();
    });
  },
);

describe("FlowCloseToggle — reactive to session changes", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_DATE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the button after the changelog becomes editable on login", async () => {
    const { element, state, sessionSubject } = await mountCloseToggle({
      editable: false,
    });
    expect(element.querySelector("button")).toBeNull();

    state.editable = true;
    sessionSubject.next({ isLoggedIn: true, webId: WEB_ID });
    await flush();

    expect(element.querySelector("button")).not.toBeNull();
    expect(element.querySelector("button").textContent.trim()).toBe(
      "Close comment",
    );
  });

  it("hides the button after the changelog becomes uneditable on logout", async () => {
    const { element, state, sessionSubject } = await mountCloseToggle({
      editable: true,
    });
    expect(element.querySelector("button")).not.toBeNull();

    state.editable = false;
    sessionSubject.next({ isLoggedIn: false, webId: undefined });
    await flush();

    expect(element.querySelector("button")).toBeNull();
  });

  it("refetches the changelog when the session changes", async () => {
    const { os, sessionSubject } = await mountCloseToggle();
    const before = os.store.fetch.mock.calls.length;

    sessionSubject.next({ isLoggedIn: true, webId: WEB_ID });
    await flush();

    expect(os.store.fetch.mock.calls.length).toBeGreaterThan(before);
  });

  it("unsubscribes from the session on disconnect", async () => {
    const unsubscribe = vi.fn();
    const observeSession = () => ({
      subscribe: vi.fn(() => ({ unsubscribe })),
    });
    const { element } = await mountCloseToggle({ observeSession });

    element.remove();
    document.body.innerHTML = "";

    expect(unsubscribe).toHaveBeenCalled();
  });
});
