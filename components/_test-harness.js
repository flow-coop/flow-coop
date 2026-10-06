import { vi } from "vitest";
import { BehaviorSubject } from "rxjs";

export function createMockOs(overrides = {}) {
  return {
    session: {
      authenticatedFetch: vi.fn().mockResolvedValue({ status: 200, ok: true }),
      session: { webId: undefined },
    },
    observeSession: vi.fn(
      () => new BehaviorSubject({ isLoggedIn: false, webId: undefined }),
    ),
    store: {
      fetch: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockImplementation((uri) => mockThing(uri)),
      statementsMatching: vi.fn(() => []),
    },
    ...overrides,
  };
}

function statementTerm(value) {
  return { value };
}

export function createMockStore({ statements = [], failOn = [] } = {}) {
  const loaded = new Set();
  const failures = new Set(failOn);
  const bySubject = new Map();
  for (const statement of statements) {
    if (!bySubject.has(statement.subject)) bySubject.set(statement.subject, []);
    bySubject.get(statement.subject).push(statement);
  }

  return {
    fetch: vi.fn(async (uri) => {
      if (failures.has(uri)) throw new Error(`Failed to fetch ${uri}`);
      loaded.add(uri);
    }),
    get: vi.fn((uri) => {
      const subjectStatements = bySubject.get(uri) ?? [];
      return {
        uri,
        types: () => [],
        relations: (predicate) => {
          const uris = subjectStatements
            .filter((statement) => statement.predicate === predicate)
            .map((statement) => statement.object);
          return uris.length ? [{ predicate, label: predicate, uris }] : [];
        },
        anyValue: (predicate) => {
          const match = subjectStatements.find(
            (statement) => statement.predicate === predicate,
          );
          return match ? match.object : undefined;
        },
      };
    }),
    statementsMatching: vi.fn(() =>
      statements
        .filter((statement) => loaded.has(statement.graph))
        .map((statement) => ({
          subject: statementTerm(statement.subject),
          predicate: statementTerm(statement.predicate),
          object: statementTerm(statement.object),
          graph: statementTerm(statement.graph),
        })),
    ),
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
