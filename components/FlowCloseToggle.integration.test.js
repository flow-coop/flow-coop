// @vitest-environment happy-dom
// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BehaviorSubject } from "rxjs";
import { PodOS } from "@pod-os/core";
import { currentMonthChangelogUrl } from "./currentMonthChangelogUrl.js";
import "./FlowCloseToggle.js";

const FIXED_DATE = new Date(Date.UTC(2026, 8, 15, 12, 0, 0));
const DRAFT_URL = "https://flowcoop.eu/topics/task_management/history/draft/";
const PATCH_URL = currentMonthChangelogUrl(DRAFT_URL, FIXED_DATE);
const NOTE_URI = "https://mastodon.social/users/jg10/statuses/1";
const WEB_ID = "https://pod.example/profile#me";

const TURTLE = `<${PATCH_URL}> a <https://www.w3.org/ns/activitystreams#OrderedCollectionPage>.`;

function changelogResponse({ write }) {
  return new Response(TURTLE, {
    status: 200,
    headers: {
      "Content-Type": "text/turtle; charset=utf-8",
      "WAC-Allow": write
        ? 'user="read write", public="read"'
        : 'user="read", public="read"',
      "Accept-Patch": "text/n3",
    },
  });
}

function buildOs() {
  const sessionInfo$ = new BehaviorSubject({ isLoggedIn: false, webId: "" });
  const authenticatedFetch = vi.fn(() =>
    Promise.resolve(
      changelogResponse({ write: sessionInfo$.getValue().isLoggedIn }),
    ),
  );
  const os = new PodOS({
    session: {
      authenticatedFetch,
      observeSession: () => sessionInfo$,
      login: async () => {},
      logout: async () => {},
    },
  });
  return { os, sessionInfo$, authenticatedFetch };
}

function mountToggle(os) {
  const host = document.createElement("div");
  host.innerHTML = `<flow-close-toggle></flow-close-toggle>`;
  document.body.appendChild(host);
  const element = host.querySelector("flow-close-toggle");
  Object.defineProperty(element, "baseURI", {
    value: DRAFT_URL,
    configurable: true,
  });
  element.os = os;
  element.receiveResource({ uri: NOTE_URI });
  return { element, host };
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe("FlowCloseToggle integration (real pod-os + rdflib)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_DATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("derives editable from WAC-Allow via the real store fetcher", async () => {
    const read = buildOs();
    await read.os.store.fetch(PATCH_URL);
    expect(read.os.store.get(PATCH_URL).editable).toBe(false);

    const write = buildOs();
    write.sessionInfo$.next({ isLoggedIn: true, webId: WEB_ID });
    await write.os.store.fetch(PATCH_URL);
    expect(write.os.store.get(PATCH_URL).editable).toBe(true);
  });

  it("hides the control for a signed-in user without write permission", async () => {
    const { os, sessionInfo$ } = buildOs();
    sessionInfo$.next({ isLoggedIn: true, webId: WEB_ID });
    os.session.authenticatedFetch.mockImplementation(() =>
      Promise.resolve(changelogResponse({ write: false })),
    );

    const { element } = mountToggle(os);
    await tick(100);

    expect(os.store.get(PATCH_URL).editable).toBe(false);
    expect(element.querySelector("button")).toBeNull();
  });

  it("shows the control after login when the first load was anonymous", async () => {
    const { os, sessionInfo$ } = buildOs();
    const { element } = mountToggle(os);
    await tick(100);
    expect(element.querySelector("button")).toBeNull();

    sessionInfo$.next({ isLoggedIn: true, webId: WEB_ID });
    await vi.waitFor(
      () => expect(element.querySelector("button")).not.toBeNull(),
      { timeout: 2000 },
    );
    expect(os.store.get(PATCH_URL).editable).toBe(true);
  });

  it("keeps the control shown when the anonymous load resolves after login", async () => {
    const { os, sessionInfo$ } = buildOs();
    let resolveAnonymous;
    os.session.authenticatedFetch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveAnonymous = () =>
              resolve(changelogResponse({ write: false }));
          }),
      )
      .mockImplementation(() =>
        Promise.resolve(changelogResponse({ write: true })),
      );

    const { element } = mountToggle(os);
    await tick(50);
    expect(element.querySelector("button")).toBeNull();

    // Session restores while the anonymous fetch is still in flight.
    sessionInfo$.next({ isLoggedIn: true, webId: WEB_ID });
    await tick(50);

    // The stale anonymous response lands late.
    resolveAnonymous();
    await tick(200);

    expect(os.store.get(PATCH_URL).editable).toBe(true);
    expect(element.querySelector("button")).not.toBeNull();
  });
});
