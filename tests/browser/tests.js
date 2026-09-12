import DOMPurify from "/components/vendor/DOMPurify-3.4.14.es.mjs";
import {
  createComponentLoader,
  observeRegisteredElements,
} from "/components/ComponentLoader.js";
import { validatedTemplateFragment } from "/components/ImportHtml.js";
import {
  resolveVersionContext,
} from "/components/FlowVersionContext.js";
import { FlowVersionReady } from "/components/FlowVersionReady.js";
import {
  FlowCollectionPages,
  validateCollectionResource,
} from "/components/FlowCollectionPages.js";
import { FlowIfOpen } from "/components/FlowIfOpen.js";
import { sanitizedContentFragment } from "/components/FlowSanitizedContent.js";

const AS_COLLECTION = "https://www.w3.org/ns/activitystreams#OrderedCollection";
const AS_PAGE = "https://www.w3.org/ns/activitystreams#OrderedCollectionPage";
const AS_FIRST = "https://www.w3.org/ns/activitystreams#first";
const AS_ITEMS = "https://www.w3.org/ns/activitystreams#items";
const AS_NEXT = "https://www.w3.org/ns/activitystreams#next";
const AS_NOTE = "https://www.w3.org/ns/activitystreams#Note";
const PROV_USED = "http://www.w3.org/ns/prov#used";
const PROV_WAS_GENERATED_BY = "http://www.w3.org/ns/prov#wasGeneratedBy";
const results = document.querySelector("#results");
let failures = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(name, run) {
  const item = document.createElement("li");
  try {
    await run();
    item.textContent = `PASS: ${name}`;
  } catch (error) {
    failures += 1;
    item.textContent = `FAIL: ${name}: ${error.message}`;
  }
  results.append(item);
}

function waitForMutation() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

class MockResource {
  constructor(uri, entry = {}) {
    this.uri = uri;
    this.entry = entry;
  }

  relations(predicate) {
    const uris = this.entry.relations?.[predicate] || [];
    return uris.map(uri => ({ uris: [uri] }));
  }

  types() {
    return (this.entry.types || []).map(uri => ({ uri }));
  }

  anyValue(predicate) {
    return this.entry.values?.[predicate];
  }
}

class MockStore {
  constructor(entries) {
    this.entries = entries;
    this.fetched = [];
  }

  get(uri) {
    return new MockResource(uri, this.entries[uri]);
  }

  async fetch(uri) {
    this.fetched.push(uri);
    if (this.entries[uri]?.reject) throw new Error(`Fetch failed: ${uri}`);
  }
}

function collectionMarkup() {
  return `
    <template><div data-flow-resource></div></template>
    <div data-items></div>
    <p data-loading hidden>Loading</p>
    <p data-empty hidden>Empty</p>
    <p data-error hidden>Error</p>
    <p data-cycle hidden>Cycle</p>
    <p data-capped hidden>Capped</p>
    <button data-load-more hidden>
      <span data-load-more-label>More</span>
      <span data-retry-label hidden>Retry</span>
    </button>
  `;
}

await test("loader handles initial, dynamic, ordered, and deduplicated elements", async () => {
  const calls = [];
  const registry = {
    "test-parent": { provider: "flow", module: "pair", attributes: [] },
    "test-child": { provider: "flow", module: "pair", attributes: [] },
    "test-dynamic": { provider: "flow", module: "dynamic", attributes: [] },
  };
  const importer = async module => {
    calls.push(module);
    if (module === "pair") {
      customElements.define("test-parent", class extends HTMLElement {});
      assert(customElements.get("test-parent"), "parent was not defined first");
      customElements.define("test-child", class extends HTMLElement {});
    }
    if (module === "dynamic") {
      customElements.define("test-dynamic", class extends HTMLElement {});
    }
  };
  const host = document.createElement("div");
  host.innerHTML = "<test-parent><test-child></test-child></test-parent>";
  document.body.append(host);
  const observed = observeRegisteredElements(
    host,
    createComponentLoader({ registry, importer }),
  );
  await observed.loader.whenIdle();
  host.append(document.createElement("test-dynamic"));
  await waitForMutation();
  await observed.loader.whenIdle();
  observed.disconnect();
  assert(customElements.get("test-dynamic"), "dynamic element was not loaded");
  assert(calls.filter(value => value === "pair").length === 1, "module imported twice");
  host.remove();
});

await test("loader reports import and registration failures", async () => {
  const host = document.createElement("div");
  host.innerHTML = "<test-import-failure></test-import-failure><test-definition-failure></test-definition-failure>";
  document.body.append(host);
  const codes = [];
  host.addEventListener("flow:error", event => codes.push(event.detail.code));
  const loader = createComponentLoader({
    registry: {
      "test-import-failure": { provider: "flow", module: "reject", attributes: [] },
      "test-definition-failure": { provider: "flow", module: "empty", attributes: [] },
    },
    importer: async module => {
      if (module === "reject") throw new Error("rejected");
    },
  });
  await loader.scheduleScan(host);
  assert(codes.includes("component-load-failed"), "missing component-load-failed");
  assert(codes.includes("component-not-defined"), "missing component-not-defined");
  host.remove();
});

await test("templates use DOMPurify ESM and reject executable or unknown markup", async () => {
  assert(typeof DOMPurify.sanitize === "function", "DOMPurify ESM did not load");
  const source = new URL("/templates/test.html", location.href);
  const valid = validatedTemplateFragment(
    '<flow-if-open uri="https://example.test/note"><template><p>Safe</p></template></flow-if-open>',
    source,
  );
  assert(valid.querySelector("flow-if-open"), "trusted element was removed");
  for (const html of [
    "<script>alert(1)</script>",
    "<template><img src=x onerror=alert(1)></template>",
    "<unknown-widget></unknown-widget>",
    '<a href="javascript:alert(1)">unsafe</a>',
    "<form><input></form>",
  ]) {
    let rejected = false;
    try {
      validatedTemplateFragment(html, source);
    } catch {
      rejected = true;
    }
    assert(rejected, `unsafe template accepted: ${html}`);
  }
});

await test("every shipped template passes the shared sanitizer policy", async () => {
  const paths = [
    "/templates/activity-changes.html",
    "/templates/changes.html",
    "/templates/discussion/comment.html",
    "/templates/discussion/header.html",
    "/templates/discussion/outbox.html",
    "/templates/discussion/section.html",
    "/templates/pages/home.html",
    "/templates/pages/about-flows.html",
    "/templates/pages/about-tools.html",
    "/templates/pages/about-topics.html",
    "/templates/pages/topic-task-management.html",
    "/templates/versions/status.html",
  ];
  for (const path of paths) {
    const response = await fetch(path);
    assert(response.ok, `${path} returned ${response.status}`);
    validatedTemplateFragment(await response.text(), new URL(path, location.href));
  }
});

await test("comment HTML is sanitized and retained links are safe", async () => {
  const fragment = sanitizedContentFragment(
    '<p onclick="alert(1)">Hello <a href="javascript:alert(1)">bad</a> <a href="/good">good</a></p><img src=x>',
    "https://example.test/note",
    DOMPurify,
  );
  assert(!fragment.querySelector("img"), "disallowed image survived");
  assert(!fragment.querySelector("[onclick]"), "event attribute survived");
  assert(!fragment.querySelector("a:first-of-type").hasAttribute("href"), "unsafe link survived");
  const safe = fragment.querySelector("a:last-of-type");
  assert(safe.href === "https://example.test/good", "safe link was not resolved");
  assert(safe.rel === "noopener noreferrer", "safe link lacks isolation");
});

await test("supplementary provenance resolves all used resources", async () => {
  const version = "https://example.test/topic/";
  const provenance = "https://example.test/topic/index.ttl";
  const activity = `${provenance}#migration`;
  const notes = Array.from({ length: 8 }, (_, index) => `https://social.test/note/${index}`);
  const store = new MockStore({
    [version]: { relations: { [PROV_WAS_GENERATED_BY]: [activity] } },
    [provenance]: {},
    [activity]: { relations: { [PROV_USED]: notes } },
  });
  const context = await resolveVersionContext({ store }, version, [provenance]);
  assert(context.directUsedUris.size === 8, "did not resolve eight direct Notes");
  assert(store.fetched.includes(provenance), "supplementary provenance was not fetched");
});

await test("explicit version activity excludes stale root activities", async () => {
  const version = "https://example.test/topic/";
  const selected = "https://example.test/topic/index.ttl#migration";
  const stale = "https://example.test/history/stale-activity";
  const selectedNote = "https://social.test/note/selected";
  const staleNote = "https://social.test/note/stale";
  const store = new MockStore({
    [version]: { relations: { [PROV_WAS_GENERATED_BY]: [stale, selected] } },
    [selected]: { relations: { [PROV_USED]: [selectedNote] } },
    [stale]: { relations: { [PROV_USED]: [staleNote] } },
  });
  const context = await resolveVersionContext(
    { store },
    version,
    [],
    [selected],
  );
  assert(context.directUsedUris.has(selectedNote), "selected activity was not used");
  assert(!context.usedUris.has(staleNote), "stale root activity contaminated context");
});

await test("task Changes stays independent when its outbox fails", async () => {
  const path = "/templates/pages/topic-task-management.html";
  const response = await fetch(path);
  const fragment = validatedTemplateFragment(
    await response.text(),
    new URL(path, location.href),
  );
  const discussion = fragment.querySelector(
    'import-html[src="/templates/discussion/section.html"]',
  );
  const versionReady = fragment.querySelector("flow-version-ready");
  const readyTemplate = versionReady?.querySelector(
    ":scope > template:not([data-error-template])",
  );
  const changes = readyTemplate?.content.querySelector(
    'pos-resource[uri="https://flowcoop.eu/topics/task_management/index.ttl#migration"] > import-html[src="/templates/activity-changes.html"]',
  );
  assert(discussion, "task discussion import is missing");
  assert(changes, "task Changes import is missing");
  assert(!discussion.contains(changes), "Changes is nested under discussion");

  const collection = "https://example.test/failing-outbox";
  const failed = new FlowCollectionPages();
  failed.innerHTML = collectionMarkup();
  failed.os = { store: new MockStore({ [collection]: { reject: true } }) };
  await failed.initialise(collection, ++failed._generation);
  assert(failed.hasAttribute("error"), "mocked outbox did not fail");
  assert(!failed.querySelector("[data-error]").hidden, "outbox error stayed hidden");
  assert(!failed.querySelector("[data-load-more]").hidden, "root retry stayed hidden");

  failed.os.store.entries[collection] = { types: [AS_COLLECTION] };
  failed._handleClick({ target: failed.querySelector("[data-load-more]") });
  await waitForMutation();
  await waitForMutation();
  assert(failed.hasAttribute("ready"), "recovered outbox could not be retried");
  assert(readyTemplate.content.contains(changes), "outbox failure removed Changes");
});

await test("discussion relations instantiate before remote fetches", async () => {
  const path = "/templates/discussion/section.html";
  const response = await fetch(path);
  const fragment = validatedTemplateFragment(
    await response.text(),
    new URL(path, location.href),
  );
  const sectionTemplate = fragment.querySelector("pos-case > template");
  const actorList = sectionTemplate?.content.querySelector(
    'pos-list[rel="https://flowcoop.eu/templates/discussion/terms#actor"]',
  );
  const outboxList = sectionTemplate?.content.querySelector(
    'pos-list[rel="https://flowcoop.eu/templates/discussion/terms#outbox"]',
  );
  assert(actorList && !actorList.hasAttribute("fetch"), "actor controls wait on a remote fetch");
  assert(outboxList && !outboxList.hasAttribute("fetch"), "collection waits on a duplicate remote fetch");
});

await test("version readiness instantiates authored content after provenance", async () => {
  const context = document.createElement("flow-version-context");
  context.setAttribute("ready", "");
  const element = new FlowVersionReady();
  element.innerHTML =
    "<p data-version-waiting>Loading</p><template><p data-ready>Ready</p></template>";
  context.append(element);
  document.body.append(context);
  await waitForMutation();
  assert(element.hasAttribute("ready"), "version-dependent content is not ready");
  assert(element.querySelector("[data-ready]"), "ready template was not rendered");
  assert(element.querySelector("[data-version-waiting]").hidden, "loading state stayed visible");
  context.remove();
});

await test("collection validation accepts empty collections and rejects topic resources", async () => {
  const collection = "https://example.test/outbox";
  const topic = "https://example.test/topic";
  const store = new MockStore({
    [collection]: { types: [AS_COLLECTION] },
    [topic]: { types: [] },
  });
  validateCollectionResource(store, collection);
  let code;
  try {
    validateCollectionResource(store, topic);
  } catch (error) {
    code = error.code;
  }
  assert(code === "invalid-collection", "topic did not produce invalid-collection");

  const element = new FlowCollectionPages();
  element.innerHTML = collectionMarkup();
  element.os = { store };
  await element.initialise(collection, ++element._generation);
  assert(element.hasAttribute("ready"), "empty collection did not become ready");
  assert(!element.querySelector("[data-empty]").hidden, "empty state stayed hidden");
});

await test("collection handles pagination, cycles, caps, and descendant failures", async () => {
  const collection = "https://example.test/outbox";
  const page1 = "https://example.test/page/1";
  const page2 = "https://example.test/page/2";
  const note1 = "https://example.test/note/1";
  const note2 = "https://example.test/note/2";
  const store = new MockStore({
    [collection]: { types: [AS_COLLECTION], relations: { [AS_FIRST]: [page1] } },
    [page1]: { types: [AS_PAGE], relations: { [AS_ITEMS]: [note1], [AS_NEXT]: [page2] } },
    [page2]: { types: [AS_PAGE], relations: { [AS_ITEMS]: [note2], [AS_NEXT]: [page1] } },
    [note1]: { types: [AS_NOTE] },
    [note2]: { types: [AS_NOTE] },
  });
  const element = new FlowCollectionPages();
  element.innerHTML = collectionMarkup();
  element.os = { store };
  await element.initialise(collection, ++element._generation);
  await element.loadNextPage();
  assert(element.hasAttribute("cycle"), "cycle was not detected");
  assert(element._loadedNotes.size === 2, "paginated Notes were not collected");
  element._handleOpenState({ detail: { uri: note1, error: new Error("context") } });
  assert(element.hasAttribute("error"), "descendant failure was not surfaced");
  assert(element.querySelector("[data-empty]").hidden, "error showed an empty state");

  const capped = new FlowCollectionPages();
  capped.setAttribute("max-pages", "1");
  capped.innerHTML = collectionMarkup();
  capped.os = { store };
  await capped.initialise(collection, ++capped._generation);
  await capped.loadNextPage();
  assert(capped.hasAttribute("capped"), "page cap was not surfaced");
});

await test("missing version context reports a filtering failure", async () => {
  const element = new FlowIfOpen();
  element.innerHTML = "<template><p>Open</p></template>";
  let code;
  element.addEventListener("flow:error", event => {
    code = event.detail.component;
  });
  await element.evaluate("https://example.test/note", ++element._generation);
  assert(element.hasAttribute("error"), "missing context did not set error");
  assert(code === "flow-if-open", "missing context error was not emitted");
});

document.body.dataset.status = failures === 0 ? "passed" : "failed";
document.title = failures === 0 ? "PASS" : `FAIL (${failures})`;
