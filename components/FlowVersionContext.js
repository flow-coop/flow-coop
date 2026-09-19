import { ReceiveResourceOS } from "./ReceiveResourceOS.js";

const PROV_USED = "http://www.w3.org/ns/prov#used";
const PROV_WAS_GENERATED_BY = "http://www.w3.org/ns/prov#wasGeneratedBy";
const MAX_VERSION_RESOURCES = 50;

function relationUris(store, subjectUri, predicate) {
  return store
    .get(subjectUri)
    .relations(predicate)
    .flatMap((relation) => relation.uris);
}

function sameOrigin(left, right) {
  return new URL(left).origin === new URL(right).origin;
}

async function activityUrisForVersion(store, versionUri, cache) {
  if (cache.has(versionUri)) return cache.get(versionUri);

  await store.fetch(versionUri);
  let activityUris = relationUris(store, versionUri, PROV_WAS_GENERATED_BY);
  const url = new URL(versionUri);
  if (activityUris.length === 0 && url.pathname.endsWith("/")) {
    await store.fetch(new URL("index.ttl", url).href);
    activityUris = relationUris(store, versionUri, PROV_WAS_GENERATED_BY);
  }

  cache.set(versionUri, activityUris);
  return activityUris;
}

export async function resolveVersionContext(os, versionUri) {
  const usedUris = new Set();
  const directUsedUris = new Set();
  const activityUris = new Set();
  const visitedVersions = new Set();
  const versionActivities = new Map();
  const pendingVersions = [versionUri];

  while (pendingVersions.length > 0) {
    if (visitedVersions.size >= MAX_VERSION_RESOURCES) {
      throw new Error(
        `Version traversal exceeded ${MAX_VERSION_RESOURCES} resources.`,
      );
    }

    const currentVersion = pendingVersions.shift();
    if (visitedVersions.has(currentVersion)) continue;
    visitedVersions.add(currentVersion);

    const generatedBy = await activityUrisForVersion(
      os.store,
      currentVersion,
      versionActivities,
    );

    for (const activityUri of generatedBy) {
      activityUris.add(activityUri);
      await os.store.fetch(activityUri);
      const inputs = relationUris(os.store, activityUri, PROV_USED);

      for (const inputUri of inputs) {
        usedUris.add(inputUri);
        if (currentVersion === versionUri) directUsedUris.add(inputUri);
        if (
          !sameOrigin(versionUri, inputUri) ||
          visitedVersions.has(inputUri)
        ) {
          continue;
        }

        if (
          (await activityUrisForVersion(os.store, inputUri, versionActivities))
            .length > 0
        ) {
          pendingVersions.push(inputUri);
        }
      }
    }
  }

  return {
    versionUri,
    usedUris,
    directUsedUris,
    activityUris,
    visitedVersions,
  };
}

function getBaseUri(pageBaseURI) {
  const url = new URL(pageBaseURI);

  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1"
  ) {
    return new URL(
      `${url.pathname}${url.search}${url.hash}`,
      "https://flowcoop.eu"
    ).href;
  }

  return url.href;
}

export class FlowVersionContext extends ReceiveResourceOS {
  constructor() {
    super();
    this._generation = 0;
    this._contextPromise = Promise.reject(
      new Error("Flow version context is not ready."),
    );
    this._contextPromise.catch(() => {});
    this._handleContextRequest = (event) => {
      if (typeof event.detail?.resolve !== "function") return;
      event.stopPropagation();
      event.detail.resolve(this._contextPromise);
    };
  }

  connectedCallback() {
    this.addEventListener(
      "flow:request-version-context",
      this._handleContextRequest,
    );
    super.connectedCallback();
  }

  disconnectedCallback() {
    clearTimeout(this._osTimer);
    this.removeEventListener(
      "flow:request-version-context",
      this._handleContextRequest,
    );
    this._generation += 1;
  }

  update() {
    const value = this.getAttribute("uri") || this.resource?.uri;
    const versionUri = new URL(value, getBaseUri(this.baseURI)).href
    if (!this.os || !versionUri) return false;

    const generation = ++this._generation;
    this.removeAttribute("ready");
    this.removeAttribute("error");
    this.setAttribute("loading", "");

    this._contextPromise = resolveVersionContext(this.os, versionUri)
      .then((context) => {
        if (generation !== this._generation) return context;
        this.removeAttribute("loading");
        this.setAttribute("ready", "");
        this.dispatchEvent(
          new CustomEvent("flow:version-ready", {
            bubbles: true,
            detail: context,
          }),
        );
        return context;
      })
      .catch((error) => {
        if (generation === this._generation) this.reportError(error);
        throw error;
      });
    this._contextPromise.catch(() => {});
    return true;
  }

  reportError(error) {
    this.removeAttribute("loading");
    this.setAttribute("error", "");
    this.dispatchEvent(
      new CustomEvent("flow:error", {
        bubbles: true,
        detail: { component: "flow-version-context", error },
      }),
    );
  }
}

if (!customElements.get("flow-version-context")) {
  customElements.define("flow-version-context", FlowVersionContext);
}
