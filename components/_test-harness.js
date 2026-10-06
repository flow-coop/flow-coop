import { vi } from "vitest";

export function createMockOs(overrides = {}) {
  return {
    session: {
      authenticatedFetch: vi.fn().mockResolvedValue({ status: 200, ok: true }),
      session: { webId: undefined },
    },
    store: {
      fetch: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockImplementation((uri) => mockThing(uri)),
    },
    ...overrides,
  };
}

export function mockThing(uri, types = [], properties = {}, opts = {}) {
  return {
    uri,
    types: () => types.map((u) => ({ uri: u })),
    relations: () => [],
    anyValue: (predicate) => properties[predicate] ?? null,
    editable: opts.editable ?? false,
    observeChanges: opts.observeChanges,
  };
}
