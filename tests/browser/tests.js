import DOMPurify from "/components/vendor/DOMPurify-3.4.14.es.mjs";
import {
  createComponentLoader,
  observeRegisteredElements,
} from "/components/ComponentLoader.js";
import {
  ImportHtml,
  templateUrl,
  validatedTemplateFragment,
} from "/components/ImportHtml.js";
import {
  FlowVersionContext,
  resolveVersionContext,
} from "/components/FlowVersionContext.js";
import { FlowVersionReady } from "/components/FlowVersionReady.js";
import {
  FlowCollectionPages,
  validateCollectionResource,
} from "/components/FlowCollectionPages.js";
import { FlowIfOpen } from "/components/FlowIfOpen.js";
import { FlowFediverseInteraction } from "/components/FlowFediverseInteraction.js";
import { sanitizedContentFragment } from "/components/FlowSanitizedContent.js";

const AS_COLLECTION = "https://www.w3.org/ns/activitystreams#OrderedCollection";
const AS_PAGE = "https://www.w3.org/ns/activitystreams#OrderedCollectionPage";
const AS_FIRST = "https://www.w3.org/ns/activitystreams#first";
const AS_ITEMS = "https://www.w3.org/ns/activitystreams#items";
const AS_NEXT = "https://www.w3.org/ns/activitystreams#next";
const AS_NOTE = "https://www.w3.org/ns/activitystreams#Note";
const PROV_ACTIVITY = "http://www.w3.org/ns/prov#Activity";
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

function waitForAttribute(element, attribute, timeout = 5_000) {
  if (element.hasAttribute(attribute)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (!element.hasAttribute(attribute)) return;
      clearTimeout(timer);
      observer.disconnect();
      resolve();
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`${attribute} timed out`));
    }, timeout);
    observer.observe(element, { attributes: true });
  });
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

function activityEntry(used = []) {
  return {
    types: [PROV_ACTIVITY],
    relations: { [PROV_USED]: used },
  };
}

function turtleSubjectBlock(source, uri) {
  const marker = `<${uri}>`;
  const lineStart = source.indexOf(`\n${marker}`);
  const start = source.startsWith(marker)
    ? 0
    : lineStart < 0
      ? -1
      : lineStart + 1;
  if (start < 0) throw new Error(`Missing Turtle subject: ${uri}`);
  const end = source.indexOf("\n\n", start);
  return source.slice(start, end < 0 ? source.length : end);
}

function turtleUsedUris(block) {
  const start = block.indexOf("prov:used");
  if (start < 0) return [];
  return [...block.slice(start).matchAll(/<([^>]+)>/gu)].map(match => match[1]);
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

await test("import-html accepts only trusted fragment and page locations", async () => {
  for (const path of [
    "/templates/discussion/header.html",
    "/index.template.html",
    "/about/topics/index.template.html",
  ]) {
    assert(templateUrl(path).pathname === path, `${path} was rejected`);
  }
  const credentialed = new URL("/index.template.html", location.href);
  credentialed.username = "user";
  credentialed.password = "password";
  for (const path of [
    "/index.html",
    "/about/topics/page.html",
    "https://example.test/index.template.html",
    credentialed.href,
  ]) {
    let rejected = false;
    try {
      templateUrl(path);
    } catch {
      rejected = true;
    }
    assert(rejected, `${path} was accepted`);
  }
});

await test("import-html loads every colocated page template", async () => {
  for (const path of [
    "/index.template.html",
    "/about/flows/index.template.html",
    "/about/tools/index.template.html",
    "/about/topics/index.template.html",
    "/topics/task_management/index.template.html",
  ]) {
    const element = new ImportHtml();
    element.setAttribute("src", path);
    element.innerHTML =
      "<p data-template-loading>Loading</p><template data-error-template><p data-page-error>Error</p></template>";
    document.body.append(element);
    await waitForAttribute(element, "ready");
    assert(!element.hasAttribute("error"), `${path} failed to load`);
    element.remove();
  }
});

await test("import-html preserves authored errors and deduplicates reconnects", async () => {
  const originalFetch = window.fetch;
  const path = "/index.template.html?lifecycle-test=1";
  let requests = 0;
  window.fetch = (...args) => {
    if (new URL(args[0], location.href).href === new URL(path, location.href).href) {
      requests += 1;
    }
    return originalFetch(...args);
  };
  try {
    const element = new ImportHtml();
    element.setAttribute("src", path);
    element.innerHTML =
      "<p data-template-loading>Loading</p><template data-error-template><p data-page-error>Page unavailable</p></template>";
    document.body.append(element);
    await waitForAttribute(element, "ready");
    element.remove();
    document.body.append(element);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert(element.hasAttribute("ready"), "reconnected template did not reload");
    assert(!element.hasAttribute("loading"), "reconnected template stayed loading");
    assert(requests === 1, `template was requested ${requests} times`);

    element.setAttribute("src", "/missing/index.template.html");
    await waitForAttribute(element, "error");
    assert(element.querySelector("[data-page-error]"), "authored error was lost");
    assert(!element.hasAttribute("ready"), "failed reload stayed ready");
    element.remove();
  } finally {
    window.fetch = originalFetch;
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
    "/index.template.html",
    "/about/flows/index.template.html",
    "/about/tools/index.template.html",
    "/about/topics/index.template.html",
    "/topics/task_management/index.template.html",
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
    [activity]: activityEntry(notes),
  });
  const context = await resolveVersionContext({ store }, version, [provenance]);
  assert(context.directUsedUris.size === 8, "did not resolve eight direct Notes");
  assert(store.fetched.includes(provenance), "supplementary provenance was not fetched");
});

await test("page version context inherits the shell resource", async () => {
  const version = "https://example.test/topic/";
  const store = new MockStore({ [version]: {} });
  const host = document.createElement("div");
  host.addEventListener("pod-os:resource", event => event.detail(store.get(version)));
  host.addEventListener("pod-os:init", event => event.detail({ store }));
  const context = document.createElement("flow-version-context");
  host.append(context);
  document.body.append(host);
  await waitForAttribute(context, "ready");
  assert(!context.hasAttribute("uri"), "page context duplicates the shell URI");
  assert(context.resource?.uri === version, "page resource was not inherited");
  host.remove();

  for (const path of [
    "/index.template.html",
    "/about/flows/index.template.html",
    "/about/tools/index.template.html",
    "/about/topics/index.template.html",
    "/topics/task_management/index.template.html",
  ]) {
    const response = await fetch(path);
    const fragment = validatedTemplateFragment(
      await response.text(),
      new URL(path, location.href),
    );
    assert(
      !fragment.querySelector("flow-version-context")?.hasAttribute("uri"),
      `${path} duplicates the shell URI`,
    );
  }
});

await test("Fediverse contributions use the resolved version context", async () => {
  const version = "https://example.test/topic/version";
  const actor = "https://social.test/users/flow";
  const host = document.createElement("div");
  host.addEventListener("flow:request-version-context", event => {
    event.detail.resolve(Promise.resolve({ versionUri: version }));
  });
  const interaction = new FlowFediverseInteraction();
  interaction.resource = new MockResource(actor, {
    values: {
      ["https://www.w3.org/ns/activitystreams#preferredUsername"]: "flow",
    },
  });
  host.append(interaction);
  const values = await interaction.interactionValues("contribute");
  assert(values.content.includes(version), "contribution omitted the resolved version");
  assert(values.content.startsWith("@flow@social.test"), "actor mention was lost");
});

await test("version history follows explicit cross-origin RDF links", async () => {
  const version = "https://example.test/topic/";
  const currentActivity = "https://example.test/activity/current";
  const previousVersion = "https://another.test/version/previous";
  const previousActivity = "https://another.test/activity/previous";
  const currentNote = "https://social.test/note/current";
  const previousNote = "https://social.test/note/previous";
  const store = new MockStore({
    [version]: { relations: { [PROV_WAS_GENERATED_BY]: [currentActivity] } },
    [currentActivity]: activityEntry([previousVersion, currentNote]),
    [previousVersion]: {
      relations: { [PROV_WAS_GENERATED_BY]: [previousActivity] },
    },
    [previousActivity]: activityEntry([previousNote]),
  });
  const context = await resolveVersionContext({ store }, version);
  assert(context.directUsedUris.has(currentNote), "current Note was not direct");
  assert(context.usedUris.has(previousNote), "cross-origin history was not traversed");
  assert(context.visitedVersions.has(previousVersion), "previous version was not visited");
  assert(!store.fetched.includes(previousVersion), "snapshotted version was fetched");
});

await test("version history does not probe unlinked sources", async () => {
  const version = "https://example.test/topic/";
  const activity = "https://example.test/activity/current";
  const source = "https://example.test/source/document";
  const store = new MockStore({
    [version]: { relations: { [PROV_WAS_GENERATED_BY]: [activity] } },
    [activity]: activityEntry([source]),
    [source]: {},
  });
  const context = await resolveVersionContext({ store }, version);
  assert(context.usedUris.has(source), "direct source was not recorded");
  assert(!store.fetched.includes(source), "unlinked source was speculatively fetched");
});

await test("version history handles cycles and fails on caps or missing activities", async () => {
  const firstVersion = "https://example.test/version/one";
  const secondVersion = "https://elsewhere.test/version/two";
  const firstActivity = "https://example.test/activity/one";
  const secondActivity = "https://elsewhere.test/activity/two";
  const cycleStore = new MockStore({
    [firstVersion]: { relations: { [PROV_WAS_GENERATED_BY]: [firstActivity] } },
    [firstActivity]: activityEntry([secondVersion]),
    [secondVersion]: { relations: { [PROV_WAS_GENERATED_BY]: [secondActivity] } },
    [secondActivity]: activityEntry([firstVersion]),
  });
  const cycle = await resolveVersionContext({ store: cycleStore }, firstVersion);
  assert(cycle.visitedVersions.size === 2, "provenance cycle did not terminate");

  const cappedEntries = {};
  for (let index = 0; index <= 50; index += 1) {
    const versionUri = `https://example.test/version/${index}`;
    const activityUri = `https://example.test/activity/${index}`;
    cappedEntries[versionUri] = {
      relations: { [PROV_WAS_GENERATED_BY]: [activityUri] },
    };
    cappedEntries[activityUri] = activityEntry(
      index < 50 ? [`https://example.test/version/${index + 1}`] : [],
    );
  }
  let capFailed = false;
  try {
    await resolveVersionContext(
      { store: new MockStore(cappedEntries) },
      "https://example.test/version/0",
    );
  } catch {
    capFailed = true;
  }
  assert(capFailed, "version traversal cap was not enforced");

  const missingActivity = "https://example.test/activity/missing";
  let missingFailed = false;
  try {
    await resolveVersionContext(
      {
        store: new MockStore({
          [firstVersion]: {
            relations: { [PROV_WAS_GENERATED_BY]: [missingActivity] },
          },
          [missingActivity]: { reject: true },
        }),
      },
      firstVersion,
    );
  } catch {
    missingFailed = true;
  }
  assert(missingFailed, "missing explicit activity did not fail closed");
});

await test("task provenance snapshots the authoritative version graph", async () => {
  const response = await fetch("/topics/task_management/index.ttl");
  const source = await response.text();
  const migration =
    "https://flowcoop.eu/topics/task_management/index.ttl#migration";
  const previousDraft =
    "https://flow.solidcommunity.net/topics/task_management/history/draft/";
  const incorporated = [
    "117116262041398775", "117116293386353207", "117116304491150823",
    "117133369969380514", "117133374863355352", "117133378229611560",
    "117133392772393654", "117133425566377347",
  ];
  const open = [
    "117116322505159764", "117116340808425129", "117133422033259970",
    "117211984867595038", "117223553798307518",
  ];
  const migrationBlock = turtleSubjectBlock(source, migration);
  const migrationInputs = turtleUsedUris(migrationBlock);
  assert(migrationInputs.includes(previousDraft), "previous draft is missing");
  assert(
    incorporated.every(id => migrationInputs.some(uri => uri.endsWith(id))),
    "migration does not contain all eight direct Notes",
  );
  assert(
    migrationInputs.length === 9,
    "migration inputs are not exactly one source and eight Notes",
  );
  assert(open.every(id => !migrationInputs.some(uri => uri.endsWith(id))), "open Note was incorporated");

  const history = [
    {
      id: "1",
      label: "Initial save",
      generated: "https://flow.solidcommunity.net/topics/task_management/history/2026/08/22-115200/",
      used: [],
    },
    {
      id: "2",
      label: "Add to why and flows",
      generated: "https://flow.solidcommunity.net/topics/task_management/history/2026/08/23-064400/",
      used: [
        "https://flow.solidcommunity.net/topics/task_management/history/2026/08/22-115200/",
        ...incorporated
          .filter(id => id !== "117116304491150823" && id !== "117133425566377347")
          .map(id => `https://mastodon.social/users/jg10/statuses/${id}`),
      ],
    },
    {
      id: "3",
      label: "Added tools",
      generated: previousDraft,
      used: [
        "https://flow.solidcommunity.net/topics/task_management/history/2026/08/23-064400/",
        "https://mastodon.social/users/jg10/statuses/117116304491150823",
        "https://mastodon.social/users/jg10/statuses/117133425566377347",
      ],
    },
  ];
  for (const expected of history) {
    const activity =
      `https://flow.solidcommunity.net/topics/task_management/history/changelog/1.ttl#${expected.id}`;
    const block = turtleSubjectBlock(source, activity);
    const inputs = turtleUsedUris(block);
    assert(block.includes(`rdfs:label "${expected.label}"`), `${expected.id} label differs`);
    assert(block.includes(`<${expected.generated}>`), `${expected.id} generated version differs`);
    assert(
      inputs.length === expected.used.length &&
        expected.used.every(uri => inputs.includes(uri)),
      `${expected.id} inputs differ`,
    );
    assert(
      turtleSubjectBlock(source, expected.generated).includes(`<${activity}>`),
      `${expected.id} inverse version link is missing`,
    );
  }

  assert(
    !FlowVersionContext.observedAttributes.includes("activity-uri"),
    "activity-uri escape hatch remains",
  );
});

await test("task Changes stays independent when its outbox fails", async () => {
  const path = "/topics/task_management/index.template.html";
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
