import { describe, it, expect } from "vitest";
import { getBaseUri } from "./getBaseUri.js";

describe("getBaseUri", () => {
  it("maps localhost to the pod origin, preserving path, search and hash", () => {
    expect(
      getBaseUri("http://localhost:9091/topics/task_management/?a=1#section"),
    ).toBe("https://flowcoop.eu/topics/task_management/?a=1#section");
  });

  it("maps 127.0.0.1 to the pod origin", () => {
    expect(getBaseUri("http://127.0.0.1:8000/topics/task_management/")).toBe(
      "https://flowcoop.eu/topics/task_management/",
    );
  });

  it("passes through non-local URLs unchanged", () => {
    expect(getBaseUri("https://flowcoop.eu/topics/task_management/")).toBe(
      "https://flowcoop.eu/topics/task_management/",
    );
  });
});
