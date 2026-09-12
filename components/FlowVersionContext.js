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
  const activityUris = relationUris(store, versionUri, PROV_WAS_GENERATED_BY);

  cache.set(versionUri, activityUris);
  return activityUris;
}

export async function resolveVersionContext(os, versionUri, provenanceUris = []) {
  const usedUris = new Set();
  const directUsedUris = new Set();
  const activityUris = new Set();
  const visitedVersions = new Set();
  const versionActivities = new Map();
  const pendingVersions = [versionUri];

  await os.store.fetch(versionUri);
  for (const provenanceUri of provenanceUris) {
    await os.store.fetch(provenanceUri);
  }

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

/**
 * Supplies provenance-derived version context to descendant Flow components.
 *
 * @customElement flow-version-context
 * @attr {string} uri - Version resource; otherwise inherited from PodOS.
 * @attr {string} provenance-uri - Explicit supplementary RDF metadata document.
 * @dependency Inherits the current resource and OS store through PodOS events.
 * @fires flow:version-ready - Provides the resolved version and used resources.
 * @fires flow:error - Reports provenance fetch or traversal failures.
 * @slot - Components that consume `flow:request-version-context`.
 * @example <flow-version-context uri="https://example.test/topic/" provenance-uri="https://example.test/topic/index.ttl"></flow-version-context>
 */
export class FlowVersionContext extends ReceiveResourceOS {
  static observedAttributes = ["provenance-uri", "uri"];

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

  attributeChangedCallback() {
    if (this.isConnected) this.update();
  }

  update() {
    const versionUri = this.getAttribute("uri") || this.resource?.uri;
    if (!this.os || !versionUri) return false;

    const generation = ++this._generation;
    this.removeAttribute("ready");
    this.removeAttribute("error");
    this.setAttribute("loading", "");
    this.updateStateMessages();

    const provenanceUri = this.getAttribute("provenance-uri");
    const provenanceUris = provenanceUri ? [new URL(provenanceUri, document.baseURI).href] : [];
    this._contextPromise = resolveVersionContext(
      this.os,
      versionUri,
      provenanceUris,
    )
      .then((context) => {
        if (generation !== this._generation) return context;
        this.removeAttribute("loading");
        this.setAttribute("ready", "");
        this.updateStateMessages();
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
    this.updateStateMessages();
    this.dispatchEvent(
      new CustomEvent("flow:error", {
        bubbles: true,
        detail: {
          component: "flow-version-context",
          code: "version-context-failed",
          error,
        },
      }),
    );
  }

  updateStateMessages() {
    const loading = this.querySelector(":scope [data-version-loading]");
    const error = this.querySelector(":scope [data-version-error]");
    if (loading) loading.hidden = !this.hasAttribute("loading");
    if (error) error.hidden = !this.hasAttribute("error");
  }
}

if (!customElements.get("flow-version-context")) {
  customElements.define("flow-version-context", FlowVersionContext);
}
