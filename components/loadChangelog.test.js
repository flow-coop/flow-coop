// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import { BehaviorSubject } from "rxjs";
import { loadChangelog, invalidateChangelog } from "./loadChangelog.js";
import { createMockOs } from "./_test-harness.js";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function makeSessionOs(initial = { isLoggedIn: false, webId: undefined }) {
  const subject = new BehaviorSubject(initial);
  return {
    subject,
    observeSession: () => subject,
    store: {
      fetch: vi.fn().mockResolvedValue(undefined),
      flagAuthorizationMetadata: vi.fn(),
    },
  };
}

const URL =
  "https://flowcoop.eu/topics/task_management/history/changelog/2026/09";

describe("loadChangelog", () => {
  it("fetches the changelog through the os store (authenticated fetcher)", async () => {
    const os = createMockOs();
    await loadChangelog(os, URL);
    expect(os.store.fetch).toHaveBeenCalledWith(URL);
  });

  it("caches the fetch per os and url", async () => {
    const os = createMockOs();
    await Promise.all([loadChangelog(os, URL), loadChangelog(os, URL)]);
    await loadChangelog(os, URL);
    expect(os.store.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not share the cache across os instances", async () => {
    const first = createMockOs();
    const second = createMockOs();
    await loadChangelog(first, URL);
    await loadChangelog(second, URL);
    expect(first.store.fetch).toHaveBeenCalledTimes(1);
    expect(second.store.fetch).toHaveBeenCalledTimes(1);
  });

  it("refetches after invalidateChangelog", async () => {
    const os = createMockOs();
    await loadChangelog(os, URL);
    invalidateChangelog(os, URL);
    await loadChangelog(os, URL);
    expect(os.store.fetch).toHaveBeenCalledTimes(2);
  });

  it("resolves without throwing when the store fetch rejects", async () => {
    const os = createMockOs();
    os.store.fetch.mockRejectedValue(new Error("network"));
    await expect(loadChangelog(os, URL)).resolves.toBeDefined();
  });

  it("does not fetch without os or url", async () => {
    const os = createMockOs();
    await loadChangelog(undefined, URL);
    await loadChangelog(os, "");
    expect(os.store.fetch).not.toHaveBeenCalled();
  });
});

describe("loadChangelog session changes", () => {
  it("refetches and flags stale metadata after login", async () => {
    const os = makeSessionOs();
    await loadChangelog(os, URL);
    expect(os.store.fetch).toHaveBeenCalledTimes(1);

    os.subject.next({ isLoggedIn: true, webId: "https://x.example/#me" });
    await loadChangelog(os, URL);

    expect(os.store.fetch).toHaveBeenCalledTimes(2);
    expect(os.store.flagAuthorizationMetadata).toHaveBeenCalledTimes(1);
  });

  it("does not refetch when the session key is unchanged", async () => {
    const os = makeSessionOs();
    await loadChangelog(os, URL);
    await loadChangelog(os, URL);
    expect(os.store.fetch).toHaveBeenCalledTimes(1);
    expect(os.store.flagAuthorizationMetadata).not.toHaveBeenCalled();
  });

  it("does not reuse the pre-login promise after login", async () => {
    const os = makeSessionOs();
    const first = loadChangelog(os, URL);
    os.subject.next({ isLoggedIn: true, webId: "https://x.example/#me" });
    const second = loadChangelog(os, URL);
    expect(second).not.toBe(first);
    await Promise.all([first, second]);
  });

  it("waits for an in-flight fetch, then flags before refetching after a session change", async () => {
    const os = makeSessionOs();
    let resolveFirst;
    const firstFetch = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    os.store.fetch
      .mockReturnValueOnce(firstFetch)
      .mockResolvedValue(undefined);

    const inFlight = loadChangelog(os, URL);
    os.subject.next({ isLoggedIn: true, webId: "https://x.example/#me" });
    const refreshed = loadChangelog(os, URL);

    await tick();
    expect(os.store.fetch).toHaveBeenCalledTimes(1);
    expect(os.store.flagAuthorizationMetadata).not.toHaveBeenCalled();

    resolveFirst();
    await Promise.all([inFlight, refreshed]);

    expect(os.store.fetch).toHaveBeenCalledTimes(2);
    expect(os.store.flagAuthorizationMetadata).toHaveBeenCalledTimes(1);
  });

  it("refetches after logout", async () => {
    const os = makeSessionOs({
      isLoggedIn: true,
      webId: "https://x.example/#me",
    });
    await loadChangelog(os, URL);
    os.subject.next({ isLoggedIn: false, webId: undefined });
    await loadChangelog(os, URL);

    expect(os.store.fetch).toHaveBeenCalledTimes(2);
    expect(os.store.flagAuthorizationMetadata).toHaveBeenCalledTimes(1);
  });
});
