const cache = new WeakMap();

function cacheFor(os) {
  let byUrl = cache.get(os);
  if (!byUrl) {
    byUrl = new Map();
    cache.set(os, byUrl);
  }
  return byUrl;
}

export function loadChangelog(os, url) {
  if (!os?.store?.fetch || !url) return Promise.resolve(false);
  const byUrl = cacheFor(os);
  if (!byUrl.has(url)) {
    const request = Promise.resolve()
      .then(() => os.store.fetch(url))
      .then(() => true, () => false);
    byUrl.set(url, request);
  }
  return byUrl.get(url);
}

export function invalidateChangelog(os, url) {
  cache.get(os)?.delete(url);
}
