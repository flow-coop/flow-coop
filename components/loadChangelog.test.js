// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import { loadChangelog, invalidateChangelog } from "./loadChangelog.js";
import { createMockOs } from "./_test-harness.js";

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
