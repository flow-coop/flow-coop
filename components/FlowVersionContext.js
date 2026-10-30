import { ReceiveResourceOS } from "./ReceiveResourceOS.js";
import { loadChangelog } from "./loadChangelog.js";
import { getBaseUri } from "./getBaseUri.js";

const LDP_CONTAINS = "http://www.w3.org/ns/ldp#contains";
const PROV_GENERATED = "http://www.w3.org/ns/prov#generated";
const PROV_USED = "http://www.w3.org/ns/prov#used";
const PROV_ENDED_AT_TIME = "http://www.w3.org/ns/prov#endedAtTime";
const PROV_WAS_GENERATED_BY = "http://www.w3.org/ns/prov#wasGeneratedBy";
const MAX_CHANGELOG_RESOURCES = 50;

function isDraftVersionUri(uri) {
  return /\/history\/draft\/?$/.test(new URL(uri).pathname);
}

function relationUris(store, subjectUri, predicate) {
  return store
    .get(subjectUri)
    .relations(predicate)
    .flatMap((relation) => relation.uris);
}

function withoutFragment(uri) {
  const index = uri.indexOf("#");
  return index === -1 ? uri : uri.slice(0, index);
}

function normalizeUri(uri) {
  return uri.endsWith("/") ? uri.slice(0, -1) : uri;
}

function changelogRootFor(versionUri) {
  const url = new URL(versionUri);
  const match = url.pathname.match(/^(.*\/history\/)/);
  if (!match) return null;
  url.pathname = `${match[1]}changelog/`;
  return url.href;
}

function changelogRootForActivity(activityUri) {
  const url = new URL(activityUri);
  const match = url.pathname.match(/^(.*\/history\/changelog\/)/);
  if (!match) return null;
  url.pathname = match[1];
  url.hash = "";
  return url.href;
}

function currentMonthChangelogUrlForRoot(root, date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return new URL(`${yyyy}/${mm}`, root).href;
}

async function discoverChangelogRoot(os, versionUri) {
  const pathRoot = changelogRootFor(versionUri);
  if (pathRoot) return { root: pathRoot, includeAll: isDraftVersionUri(versionUri) };

  const loaded = await loadChangelog(os, versionUri);
  if (!loaded) return { root: null, includeAll: true };

  for (const activityUri of relationUris(
    os.store,
    versionUri,
    PROV_WAS_GENERATED_BY,
  )) {
    const root = changelogRootForActivity(activityUri);
    if (root) return { root, includeAll: true };
  }

  return { root: null, includeAll: true };
}

async function collectChangelogDocuments(os, root, includeCurrentMonth) {
  const documents = new Set();
  const visited = new Set();
  const queue = [];

  if (root) {
    documents.add(root);
    queue.push(root);
  }
  if (root && includeCurrentMonth) {
    const currentMonth = currentMonthChangelogUrlForRoot(root);
    if (!documents.has(currentMonth)) {
      documents.add(currentMonth);
      queue.push(currentMonth);
    }
  }

  while (queue.length > 0) {
    if (visited.size >= MAX_CHANGELOG_RESOURCES) {
      throw new Error(
        `Changelog traversal exceeded ${MAX_CHANGELOG_RESOURCES} resources.`,
      );
    }

    const documentUri = queue.shift();
    if (visited.has(documentUri)) continue;
    visited.add(documentUri);

    const loaded = await loadChangelog(os, documentUri);
    if (!loaded) continue;

    for (const child of relationUris(os.store, documentUri, LDP_CONTAINS)) {
      const childDocument = withoutFragment(child);
      if (documents.has(childDocument)) continue;
      documents.add(childDocument);
      queue.push(childDocument);
    }
  }

  return documents;
}

function activitiesInDocuments(store, documents) {
  const activities = new Map();

  for (const statement of store.statementsMatching()) {
    if (!documents.has(statement.graph?.value)) continue;
    const predicate = statement.predicate?.value;
    if (
      predicate !== PROV_USED &&
      predicate !== PROV_GENERATED &&
      predicate !== PROV_ENDED_AT_TIME
    ) {
      continue;
    }

    const subject = statement.subject.value;
    let activity = activities.get(subject);
    if (!activity) {
      activity = { uri: subject, generated: [], used: [], endedAtTime: null };
      activities.set(subject, activity);
    }

    if (predicate === PROV_USED) activity.used.push(statement.object.value);
    else if (predicate === PROV_GENERATED)
      activity.generated.push(statement.object.value);
    else activity.endedAtTime = statement.object.value;
  }

  return [...activities.values()];
}

function cutoffForVersion(activities, versionUri) {
  const target = normalizeUri(versionUri);
  const match = activities.find((activity) =>
    activity.generated.some(
      (generated) => normalizeUri(generated) === target,
    ),
  );
  return match?.endedAtTime ?? null;
}

export async function resolveVersionContext(os, versionUri) {
  const origin = new URL(versionUri).origin;
  const { root, includeAll } = await discoverChangelogRoot(os, versionUri);
  const documents = await collectChangelogDocuments(os, root, includeAll);
  const activities = activitiesInDocuments(os.store, documents);

  const cutoff = includeAll ? null : cutoffForVersion(activities, versionUri);
  const scoped =
    cutoff === null
      ? activities
      : activities.filter(
          (activity) =>
            activity.endedAtTime !== null && activity.endedAtTime <= cutoff,
        );

  const usedUris = new Set();
  for (const activity of scoped) {
    for (const usedUri of activity.used) {
      let usedOrigin;
      try {
        usedOrigin = new URL(usedUri).origin;
      } catch {
        continue;
      }
      if (usedOrigin !== origin) usedUris.add(usedUri);
    }
  }

  return {
    versionUri,
    usedUris,
    activityUris: new Set(activities.map((activity) => activity.uri)),
    visitedVersions: documents,
  };
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
