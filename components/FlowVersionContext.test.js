// @vitest-environment happy-dom
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { resolveVersionContext } from "./FlowVersionContext.js";
import { createMockOs, createMockStore } from "./_test-harness.js";
import { currentMonthChangelogUrl } from "./currentMonthChangelogUrl.js";

const BASE = "https://flowcoop.eu/topics/task_management/history/";
const DRAFT_URI = `${BASE}draft/`;
const VERSION_A = `${BASE}aaa/`;
const ROOT = `${BASE}changelog/`;
const YEAR = `${ROOT}2026/`;
const MONTH = `${YEAR}09`;
const ACTIVITY_A = `${MONTH}#aaa`;
const ACTIVITY_B = `${MONTH}#bbb`;

const LDP_CONTAINS = "http://www.w3.org/ns/ldp#contains";
const PROV_GENERATED = "http://www.w3.org/ns/prov#generated";
const PROV_USED = "http://www.w3.org/ns/prov#used";
const PROV_ENDED_AT_TIME = "http://www.w3.org/ns/prov#endedAtTime";

const COMMENT_1 = "https://mastodon.social/users/jg10/statuses/1";
const COMMENT_2 = "https://mastodon.social/users/jg10/statuses/2";
const COMMENT_3 = "https://mastodon.social/users/jg10/statuses/3";
const PREVIOUS_VERSION = `${BASE}prev`;

const STATEMENTS = [
  { subject: ROOT, predicate: LDP_CONTAINS, object: YEAR, graph: ROOT },
  { subject: YEAR, predicate: LDP_CONTAINS, object: MONTH, graph: YEAR },
  {
    subject: ACTIVITY_A,
    predicate: PROV_GENERATED,
    object: VERSION_A,
    graph: MONTH,
  },
  {
    subject: ACTIVITY_A,
    predicate: PROV_ENDED_AT_TIME,
    object: "2026-09-10T12:00:00Z",
    graph: MONTH,
  },
  { subject: ACTIVITY_A, predicate: PROV_USED, object: COMMENT_1, graph: MONTH },
  { subject: ACTIVITY_A, predicate: PROV_USED, object: COMMENT_2, graph: MONTH },
  {
    subject: ACTIVITY_A,
    predicate: PROV_USED,
    object: PREVIOUS_VERSION,
    graph: MONTH,
  },
  {
    subject: ACTIVITY_B,
    predicate: PROV_GENERATED,
    object: `${BASE}bbb/`,
    graph: MONTH,
  },
  {
    subject: ACTIVITY_B,
    predicate: PROV_ENDED_AT_TIME,
    object: "2026-09-20T12:00:00Z",
    graph: MONTH,
  },
  { subject: ACTIVITY_B, predicate: PROV_USED, object: COMMENT_3, graph: MONTH },
];

function mockOs(storeOptions) {
  return createMockOs({ store: createMockStore(storeOptions) });
}

describe("resolveVersionContext", () => {
  it("collects external prov:used URIs across the changelog for a draft", async () => {
    const os = mockOs({ statements: STATEMENTS });
    const context = await resolveVersionContext(os, DRAFT_URI);

    expect(context.usedUris).toEqual(new Set([COMMENT_1, COMMENT_2, COMMENT_3]));
    expect(context.usedUris.has(PREVIOUS_VERSION)).toBe(false);
  });

  it("applies the version date cutoff for a published version", async () => {
    const os = mockOs({ statements: STATEMENTS });
    const context = await resolveVersionContext(os, VERSION_A);

    expect(context.usedUris).toEqual(new Set([COMMENT_1, COMMENT_2]));
    expect(context.usedUris.has(COMMENT_3)).toBe(false);
  });

  it("falls back to every activity when the version is not in the changelog", async () => {
    const os = mockOs({ statements: STATEMENTS });
    const context = await resolveVersionContext(os, `${BASE}missing/`);

    expect(context.usedUris).toEqual(new Set([COMMENT_1, COMMENT_2, COMMENT_3]));
  });

  it("fetches each changelog document once and reuses the loadChangelog cache", async () => {
    const os = mockOs({ statements: STATEMENTS });
    const currentMonth = currentMonthChangelogUrl(DRAFT_URI);

    await resolveVersionContext(os, DRAFT_URI);
    const callsAfterFirst = os.store.fetch.mock.calls.map(([uri]) => uri);
    await resolveVersionContext(os, DRAFT_URI);

    for (const url of [ROOT, YEAR, MONTH, currentMonth]) {
      expect(callsAfterFirst.filter((uri) => uri === url)).toHaveLength(1);
    }
    expect(os.store.fetch).toHaveBeenCalledTimes(callsAfterFirst.length);
  });

  it("does not throw and yields no used URIs when a changelog document fails", async () => {
    const os = mockOs({ statements: STATEMENTS, failOn: [ROOT] });
    const context = await resolveVersionContext(os, DRAFT_URI);

    expect(context.usedUris.size).toBe(0);
  });

  it("records every activity it scanned", async () => {
    const os = mockOs({ statements: STATEMENTS });
    const context = await resolveVersionContext(os, DRAFT_URI);

    expect(context.activityUris).toEqual(new Set([ACTIVITY_A, ACTIVITY_B]));
  });

  it("terminates when containers reference each other", async () => {
    const os = mockOs({
      statements: [
        { subject: ROOT, predicate: LDP_CONTAINS, object: YEAR, graph: ROOT },
        { subject: YEAR, predicate: LDP_CONTAINS, object: ROOT, graph: YEAR },
      ],
    });
    const context = await resolveVersionContext(os, DRAFT_URI);

    expect(context.usedUris.size).toBe(0);
  });
});
