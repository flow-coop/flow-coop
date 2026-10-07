const cache = new WeakMap();

function sessionKey(os) {
  const subject = os?.observeSession?.();
  const info =
    typeof subject?.getValue === "function" ? subject.getValue() : subject?.value;
  if (!info) return "anonymous";
  return `${info.isLoggedIn ? "in" : "out"}:${info.webId ?? ""}`;
}

function stateFor(os) {
  let state = cache.get(os);
  if (!state) {
    state = {
      entries: new Map(),
      pending: new Set(),
      sessionKey: sessionKey(os),
      barrier: null,
    };
    cache.set(os, state);
  }
  return state;
}

export function loadChangelog(os, url) {
  if (!os?.store?.fetch || !url) return Promise.resolve(false);
  const state = stateFor(os);

  if (sessionKey(os) !== state.sessionKey) {
    state.sessionKey = sessionKey(os);
    state.entries.clear();
    const pending = [...state.pending];
    state.barrier = Promise.allSettled(pending).then(() => {
      os.store.flagAuthorizationMetadata?.();
    });
  }

  const cached = state.entries.get(url);
  if (cached) return cached;

  const start = state.barrier ?? Promise.resolve();
  const promise = start
    .then(() => os.store.fetch(url))
    .then(() => true, () => false);
  state.pending.add(promise);
  promise.finally(() => state.pending.delete(promise));
  state.entries.set(url, promise);
  return promise;
}

export function invalidateChangelog(os, url) {
  cache.get(os)?.entries.delete(url);
}
