import { ReceiveResourceOS } from "./ReceiveResourceOS.js";

const AS_FIRST = "https://www.w3.org/ns/activitystreams#first";
const AS_ITEMS = "https://www.w3.org/ns/activitystreams#items";
const AS_NEXT = "https://www.w3.org/ns/activitystreams#next";
const AS_NOTE = "https://www.w3.org/ns/activitystreams#Note";
const AS_OBJECT = "https://www.w3.org/ns/activitystreams#object";
const AS_ORDERED_ITEMS = "https://www.w3.org/ns/activitystreams#orderedItems";
const COLLECTION_TYPES = new Set([
  "https://www.w3.org/ns/activitystreams#Collection",
  "https://www.w3.org/ns/activitystreams#OrderedCollection",
  "https://www.w3.org/ns/activitystreams#CollectionPage",
  "https://www.w3.org/ns/activitystreams#OrderedCollectionPage",
]);
const DEFAULT_MAX_PAGES = 50;

function relationUris(store, subjectUri, predicate) {
  return store
    .get(subjectUri)
    .relations(predicate)
    .flatMap(relation => relation.uris);
}

function isNote(store, uri) {
  return store.get(uri).types().some(type => type.uri === AS_NOTE);
}

function invalidCollection(message) {
  const error = new Error(message);
  error.code = "invalid-collection";
  return error;
}

export function validateCollectionResource(store, uri) {
  const types = store.get(uri).types().map(type => type.uri);
  if (!types.some(type => COLLECTION_TYPES.has(type))) {
    throw invalidCollection(`${uri} is not an ActivityStreams collection.`);
  }
  for (const predicate of [AS_FIRST, AS_NEXT, AS_ITEMS, AS_ORDERED_ITEMS]) {
    for (const value of relationUris(store, uri, predicate)) {
      let url;
      try {
        url = new URL(value);
      } catch {
        throw invalidCollection(`${predicate} contains an invalid resource URI.`);
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw invalidCollection(`${predicate} contains an unsafe resource URI.`);
      }
    }
  }
}

export function noteUrisForItem(store, itemUri) {
  const candidates = [itemUri, ...relationUris(store, itemUri, AS_OBJECT)];
  return [...new Set(candidates.filter(uri => isNote(store, uri)))];
}

/**
 * Traverses an inherited ActivityStreams collection and instantiates Note items.
 *
 * @customElement flow-collection-pages
 * @attr {number} max-pages - Pagination limit, capped at 50.
 * @dependency Inherits an ActivityStreams collection and OS store through PodOS.
 * @slot - A direct item template plus authored state and item containers.
 * @fires flow:collection-ready - Reports that a page's Note graph is available.
 * @fires flow:error - Codes include `invalid-collection`,
 * `collection-load-failed`, and `descendant-filter-failed`.
 * @example <flow-collection-pages max-pages="10"><template></template><div data-items></div></flow-collection-pages>
 */
export class FlowCollectionPages extends ReceiveResourceOS {
  constructor() {
    super();
    this._generation = 0;
    this._loadedPages = new Set();
    this._loadedNotes = new Set();
    this._openStates = new Map();
    this._renderedNodes = [];
    this._pendingPageUri = null;
    this._collectionUri = null;
    this._initialisedKey = null;
    this._handleClick = event => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-load-more]")
      ) {
        if (this.hasAttribute("error") && !this._pendingPageUri) {
          void this.initialise(this._collectionUri, ++this._generation);
        } else {
          void this.loadNextPage();
        }
      }
    };
    this._handleOpenState = event => {
      const { uri, open, error } = event.detail || {};
      if (!this._loadedNotes.has(uri)) return;
      this._openStates.set(uri, Boolean(open));
      if (error) this.reportError(error, "descendant-filter-failed");
      this.updateEmptyState();
    };
  }

  connectedCallback() {
    this.addEventListener("click", this._handleClick);
    this.addEventListener("flow:open-state", this._handleOpenState);
    super.connectedCallback();
  }

  disconnectedCallback() {
    clearTimeout(this._osTimer);
    this.removeEventListener("click", this._handleClick);
    this.removeEventListener("flow:open-state", this._handleOpenState);
    this._generation += 1;
  }

  update() {
    const collectionUri = this.resource?.uri;
    if (!this.os || !collectionUri) return false;
    const key = `${collectionUri}|${this.maxPages}`;
    if (key === this._initialisedKey) return true;
    this._initialisedKey = key;
    void this.initialise(collectionUri, ++this._generation);
    return true;
  }

  get maxPages() {
    const parsed = Number.parseInt(this.getAttribute("max-pages") || "", 10);
    if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_PAGES;
    return Math.min(parsed, DEFAULT_MAX_PAGES);
  }

  async initialise(collectionUri, generation) {
    this._collectionUri = collectionUri;
    this.reset();
    this.setAttribute("loading", "");
    this.updateStateMessages();
    try {
      await this.os.store.fetch(collectionUri);
      if (generation !== this._generation) return;
      validateCollectionResource(this.os.store, collectionUri);
      this._pendingPageUri = relationUris(
        this.os.store,
        collectionUri,
        AS_FIRST,
      )[0] || collectionUri;
      await this.loadNextPage();
    } catch (error) {
      if (generation === this._generation) this.reportError(error);
    }
  }

  async loadNextPage() {
    const generation = this._generation;
    const pageUri = this._pendingPageUri;
    if (!pageUri || this.hasAttribute("loading-page")) return;
    if (this._loadedPages.has(pageUri)) {
      this._pendingPageUri = null;
      this.setAttribute("cycle", "");
      this.updateControls();
      this.updateStateMessages();
      return;
    }
    if (this._loadedPages.size >= this.maxPages) {
      this._pendingPageUri = null;
      this.setAttribute("capped", "");
      this.updateControls();
      this.updateStateMessages();
      return;
    }

    this.removeAttribute("error");
    this.setAttribute("loading-page", "");
    this.updateControls();

    try {
      await this.os.store.fetch(pageUri);
      if (generation !== this._generation) return;
      validateCollectionResource(this.os.store, pageUri);
      this._loadedPages.add(pageUri);
      const itemUris = [
        ...relationUris(this.os.store, pageUri, AS_ITEMS),
        ...relationUris(this.os.store, pageUri, AS_ORDERED_ITEMS),
      ];
      for (const itemUri of new Set(itemUris)) {
        for (const noteUri of noteUrisForItem(this.os.store, itemUri)) {
          if (this._loadedNotes.has(noteUri)) continue;
          this._loadedNotes.add(noteUri);
          this.appendItem(noteUri);
        }
      }

      const nextUri = relationUris(this.os.store, pageUri, AS_NEXT)[0] || null;
      if (nextUri && this._loadedPages.has(nextUri)) {
        this.setAttribute("cycle", "");
        this._pendingPageUri = null;
      } else {
        this._pendingPageUri = nextUri;
      }
      this.removeAttribute("loading");
      this.removeAttribute("loading-page");
      this.setAttribute("ready", "");
      this.updateControls();
      this.updateEmptyState();
      this.updateStateMessages();
      this.dispatchEvent(
        new CustomEvent("flow:collection-ready", {
          bubbles: true,
          detail: {
            collectionUri: this.resource?.uri,
            noteUris: [...this._loadedNotes],
          },
        }),
      );
    } catch (error) {
      if (generation !== this._generation) return;
      this.removeAttribute("loading-page");
      this.reportError(error);
    }
  }

  appendItem(noteUri) {
    const template = this.querySelector(":scope > template");
    const container = this.querySelector(":scope > [data-items]");
    if (!template || !container) {
      throw new Error(
        "flow-collection-pages requires a direct template and data-items container.",
      );
    }

    const fragment = template.content.cloneNode(true);
    const resourceElements = fragment.querySelectorAll("[data-flow-resource]");
    if (resourceElements.length === 0) {
      throw new Error("The collection item template needs data-flow-resource.");
    }
    for (const element of resourceElements) element.setAttribute("uri", noteUri);
    const nodes = Array.from(fragment.childNodes);
    this._renderedNodes.push(...nodes);
    container.append(fragment);
  }

  reset() {
    for (const node of this._renderedNodes) node.remove();
    this._renderedNodes = [];
    this._loadedPages.clear();
    this._loadedNotes.clear();
    this._openStates.clear();
    this._pendingPageUri = null;
    this.removeAttribute("ready");
    this.removeAttribute("error");
    this.removeAttribute("cycle");
    this.removeAttribute("capped");
    this.updateControls();
    this.updateEmptyState();
    this.updateStateMessages();
  }

  updateControls() {
    const button = this.querySelector(":scope > [data-load-more]");
    if (!button) return;
    const retrying = this.hasAttribute("error");
    button.disabled =
      this.hasAttribute("loading") || this.hasAttribute("loading-page");
    button.hidden = !this._pendingPageUri && !(retrying && this._collectionUri);
    button.toggleAttribute("data-retry", retrying);
    const loadLabel = button.querySelector(":scope > [data-load-more-label]");
    const retryLabel = button.querySelector(":scope > [data-retry-label]");
    if (loadLabel) loadLabel.hidden = retrying;
    if (retryLabel) retryLabel.hidden = !retrying;
  }

  updateEmptyState() {
    const empty = this.querySelector(":scope > [data-empty]");
    if (!empty) return;
    const allNotesEvaluated =
      this._loadedNotes.size === 0 ||
      this._openStates.size === this._loadedNotes.size;
    const hasOpenNote = [...this._openStates.values()].some(Boolean);
    empty.hidden =
      this.hasAttribute("loading") ||
      this.hasAttribute("error") ||
      !allNotesEvaluated ||
      hasOpenNote;
  }

  updateStateMessages() {
    const loading = this.querySelector(":scope > [data-loading]");
    const error = this.querySelector(":scope > [data-error]");
    const cycle = this.querySelector(":scope > [data-cycle]");
    const capped = this.querySelector(":scope > [data-capped]");
    if (loading) loading.hidden = !this.hasAttribute("loading");
    if (error) error.hidden = !this.hasAttribute("error");
    if (cycle) cycle.hidden = !this.hasAttribute("cycle");
    if (capped) capped.hidden = !this.hasAttribute("capped");
  }

  reportError(error, code = error?.code || "collection-load-failed") {
    this.removeAttribute("loading");
    this.setAttribute("error", "");
    this.updateControls();
    this.updateEmptyState();
    this.updateStateMessages();
    this.dispatchEvent(
      new CustomEvent("flow:error", {
        bubbles: true,
        detail: { component: "flow-collection-pages", code, error },
      }),
    );
  }
}

if (!customElements.get("flow-collection-pages")) {
  customElements.define("flow-collection-pages", FlowCollectionPages);
}
