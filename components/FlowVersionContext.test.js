// @vitest-environment happy-dom
// @ts-nocheck
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  extractCommentUrisFromChangelogMonth,
  resolveVersionContextWithDraft,
} from "./FlowVersionContext.js";
import { createMockOs } from "./_test-harness.js";

const sampleTurtle = `@prefix as: <https://www.w3.org/ns/activitystreams#>.
@prefix prov: <http://www.w3.org/ns/prov#>.
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<#6789946> a prov:Activity;
    prov:generated <../../6789946>;
    prov:endedAtTime "2026-09-10T12:21:23Z"^^xsd:dateTime;
    rdfs:label "migrate to flow-coop-pages (partly broken)";
    prov:used <https://mastodon.social/@jg10/117116262041398775>, <https://mastodon.social/@jg10/117116293386353207>, <https://mastodon.social/users/jg10/statuses/117116304491150823>.
<#adc851d> a prov:Activity;
    prov:generated <../../adc851d>;
    prov:used <../../6789946>;
    prov:endedAtTime "2026-09-10T12:46:34Z"^^xsd:dateTime;
    rdfs:label "fix: task management data".
<#0b4ca0d> a prov:Activity;
    prov:generated <../../0b4ca0d>;
    prov:used <../../1b3cc22>;
    prov:endedAtTime "2026-09-29T10:38:21Z"^^xsd:dateTime;
    rdfs:label "PATCH topics/task_management/.changelog/2026/09.ttl via solid-github-netlify".
<> a as:OrderedCollectionPage;
    as:partOf <../>;
    as:items <#6789946>, <#adc851d>, <#0b4ca0d>.
`;

describe("extractCommentUrisFromChangelogMonth", () => {
  const pageOrigin = "https://flowcoop.eu";

  it("collects external comment URIs from prov:used across all activities", () => {
    const used = extractCommentUrisFromChangelogMonth(sampleTurtle, pageOrigin);
    expect(used).toEqual(
      new Set([
        "https://mastodon.social/@jg10/117116262041398775",
        "https://mastodon.social/@jg10/117116293386353207",
        "https://mastodon.social/users/jg10/statuses/117116304491150823",
      ]),
    );
  });

  it("excludes same-origin version URIs (e.g. <../../shortSha>)", () => {
    const used = extractCommentUrisFromChangelogMonth(sampleTurtle, pageOrigin);
    for (const uri of used) {
      expect(new URL(uri).origin).not.toBe(pageOrigin);
    }
  });

  it("returns an empty set for an empty body", () => {
    expect(extractCommentUrisFromChangelogMonth("", pageOrigin).size).toBe(0);
  });

  it("returns an empty set when no activities have external prov:used", () => {
    const turtle = `<#abc> a prov:Activity;
    prov:used <../../previous>.`;
    expect(extractCommentUrisFromChangelogMonth(turtle, pageOrigin).size).toBe(0);
  });

  it("handles a single prov:used URI without trailing comma", () => {
    const turtle = `<#abc> a prov:Activity;
    prov:used <https://other.example/comment/1>.`;
    expect(extractCommentUrisFromChangelogMonth(turtle, pageOrigin)).toEqual(
      new Set(["https://other.example/comment/1"]),
    );
  });

  it("deduplicates URIs that appear across multiple activities", () => {
    const turtle = `<#a> a prov:Activity;
    prov:used <https://other.example/x>.
<#b> a prov:Activity;
    prov:used <https://other.example/x>, <https://other.example/y>.`;
    const used = extractCommentUrisFromChangelogMonth(turtle, pageOrigin);
    expect(used.size).toBe(2);
    expect(used.has("https://other.example/x")).toBe(true);
    expect(used.has("https://other.example/y")).toBe(true);
  });
});

describe("resolveVersionContextWithDraft", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("merges comment URIs from the synthesized changelog month for a draft URI", async () => {
    const versionUri = "https://flowcoop.eu/topics/task_management/history/draft/";
    const monthTurtle = `<#abc> a prov:Activity;
    prov:used <https://mastodon.social/users/jg10/statuses/1>, <https://mastodon.social/users/jg10/statuses/2>.
.`;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(monthTurtle),
    });
    vi.stubGlobal("fetch", mockFetch);

    const os = createMockOs();
    const context = await resolveVersionContextWithDraft(os, versionUri);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://flowcoop.eu/topics/task_management/history/changelog/2026/09",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(context.usedUris.has("https://mastodon.social/users/jg10/statuses/1")).toBe(true);
    expect(context.usedUris.has("https://mastodon.social/users/jg10/statuses/2")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("does not fetch the changelog for a non-draft URI", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const os = createMockOs();
    const versionUri = "https://flowcoop.eu/topics/task_management/history/6789946/";
    const context = await resolveVersionContextWithDraft(os, versionUri);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(context.usedUris.size).toBe(0);
    vi.unstubAllGlobals();
  });

  it("returns the existing context unchanged when the changelog fetch fails", async () => {
    const versionUri = "https://flowcoop.eu/topics/task_management/history/draft/";
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", mockFetch);

    const os = createMockOs();
    const context = await resolveVersionContextWithDraft(os, versionUri);

    expect(context.usedUris.size).toBe(0);
    vi.unstubAllGlobals();
  });

  it("returns the existing context unchanged when fetch throws", async () => {
    const versionUri = "https://flowcoop.eu/topics/task_management/history/draft/";
    const mockFetch = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", mockFetch);

    const os = createMockOs();
    const context = await resolveVersionContextWithDraft(os, versionUri);

    expect(context.usedUris.size).toBe(0);
    vi.unstubAllGlobals();
  });
});
