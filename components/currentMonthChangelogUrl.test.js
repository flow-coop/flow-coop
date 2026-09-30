import { describe, it, expect } from "vitest";
import { currentMonthChangelogUrl } from "./currentMonthChangelogUrl.js";

describe("currentMonthChangelogUrl", () => {
  it("formats January 2026 from a draft URL with trailing slash", () => {
    const draft = "https://flowcoop.eu/topics/task_management/history/draft/";
    const date = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    expect(currentMonthChangelogUrl(draft, date)).toBe(
      "https://flowcoop.eu/topics/task_management/history/changelog/2026/01",
    );
  });

  it("zero-pads single-digit months", () => {
    const draft = "https://flowcoop.eu/topics/task_management/history/draft/";
    expect(
      currentMonthChangelogUrl(draft, new Date(Date.UTC(2026, 8, 1, 0, 0, 0))),
    ).toBe("https://flowcoop.eu/topics/task_management/history/changelog/2026/09");
  });

  it("handles December without zero-padding the year or month", () => {
    const draft = "https://flowcoop.eu/topics/task_management/history/draft/";
    expect(
      currentMonthChangelogUrl(draft, new Date(Date.UTC(2026, 11, 31, 23, 59, 59))),
    ).toBe("https://flowcoop.eu/topics/task_management/history/changelog/2026/12");
  });

  it("uses UTC even when the input date is in a different zone", () => {
    const draft = "https://flowcoop.eu/topics/task_management/history/draft/";
    const date = new Date("2026-09-30T01:00:00+10:00");
    expect(currentMonthChangelogUrl(draft, date)).toBe(
      "https://flowcoop.eu/topics/task_management/history/changelog/2026/09",
    );
  });

  it("handles a draft URL without trailing slash", () => {
    const draft = "https://flowcoop.eu/topics/task_management/history/draft";
    const date = new Date(Date.UTC(2026, 5, 15));
    expect(currentMonthChangelogUrl(draft, date)).toBe(
      "https://flowcoop.eu/topics/task_management/history/changelog/2026/06",
    );
  });

  it("defaults to the current date when no date is provided", () => {
    const draft = "https://flowcoop.eu/topics/task_management/history/draft/";
    const result = currentMonthChangelogUrl(draft);
    expect(result).toBe(
      "https://flowcoop.eu/topics/task_management/history/changelog/" +
        `${new Date().getUTCFullYear()}/` +
        String(new Date().getUTCMonth() + 1).padStart(2, "0"),
    );
  });
});
