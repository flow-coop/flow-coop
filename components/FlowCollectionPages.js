import { ReceiveResourceOS } from "./ReceiveResourceOS.js";

const AS_FIRST = "https://www.w3.org/ns/activitystreams#first";
const AS_ITEMS = "https://www.w3.org/ns/activitystreams#items";
const AS_NEXT = "https://www.w3.org/ns/activitystreams#next";
const AS_NOTE = "https://www.w3.org/ns/activitystreams#Note";
const AS_OBJECT = "https://www.w3.org/ns/activitystreams#object";
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

export function noteUrisForItem(store, itemUri) {
  const candidates = [itemUri, ...relationUris(store, itemUri, AS_OBJECT)];
  return [...new Set(candidates.filter(uri => isNote(store, uri)))];
}

export class FlowCollectionPages extends ReceiveResourceOS {
  constructor() {
    super();
    this._generation = 0;
    this._loadedPages = new Set();
    this._loadedNotes = new Set();
    this._openStates = new Map();
    this._renderedNodes = [];
    this._pendingPageUri = null;
    this._initialisedKey = null;
    this._handleClick = event => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-load-more]")
      ) {
        void this.loadNextPage();
      }
    };
    this._handleOpenState = event => {
      const { uri, open } = event.detail || {};
      if (!this._loadedNotes.has(uri)) return;
      this._openStates.set(uri, Boolean(open));
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
    this.reset();
    this.setAttribute("loading", "");
    try {
      await this.os.store.fetch(collectionUri);
      if (generation !== this._generation) return;
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
      return;
    }
    if (this._loadedPages.size >= this.maxPages) {
      this._pendingPageUri = null;
      this.setAttribute("capped", "");
      this.updateControls();
      return;
    }

    this.removeAttribute("error");
    this.setAttribute("loading-page", "");
    this.updateControls();

    try {
      await this.os.store.fetch(pageUri);
      if (generation !== this._generation) return;
      this._loadedPages.add(pageUri);
      for (const itemUri of relationUris(this.os.store, pageUri, AS_ITEMS)) {
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
  }

  updateControls() {
    const button = this.querySelector(":scope > [data-load-more]");
    if (!button) return;
    button.disabled = this.hasAttribute("loading-page");
    button.hidden = !this._pendingPageUri && !this.hasAttribute("error");
    button.toggleAttribute("data-retry", this.hasAttribute("error"));
  }

  updateEmptyState() {
    const empty = this.querySelector(":scope > [data-empty]");
    if (!empty) return;
    const allNotesEvaluated =
      this._loadedNotes.size === 0 ||
      this._openStates.size === this._loadedNotes.size;
    const hasOpenNote = [...this._openStates.values()].some(Boolean);
    empty.hidden =
      this.hasAttribute("loading") || !allNotesEvaluated || hasOpenNote;
  }

  reportError(error) {
    this.removeAttribute("loading");
    this.setAttribute("error", "");
    this.updateControls();
    this.dispatchEvent(
      new CustomEvent("flow:error", {
        bubbles: true,
        detail: { component: "flow-collection-pages", error },
      }),
    );
  }
}

if (!customElements.get("flow-collection-pages")) {
  customElements.define("flow-collection-pages", FlowCollectionPages);
}
