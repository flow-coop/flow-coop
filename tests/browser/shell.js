import { createComponentLoader } from "/components/ComponentLoader.js";
import {
  templateUrl,
  validatedTemplateFragment,
} from "/components/ImportHtml.js";
import { componentRegistry } from "/components/registry.js";

const routes = [
  {
    path: "/",
    resource: "https://flowcoop.eu/",
    template: "/index.template.html",
    css: "/styles/site.css",
    text: ["Flow coop", "About", "Topics"],
  },
  {
    path: "/about/flows/",
    resource: "https://flowcoop.eu/about/flows/",
    template: "/about/flows/index.template.html",
    css: "/styles/site.css",
    text: ["About Flow: Flows", "Existing flows"],
  },
  {
    path: "/about/tools/",
    resource: "https://flowcoop.eu/about/tools/",
    template: "/about/tools/index.template.html",
    css: "/styles/site.css",
    text: ["About Flow: Tools"],
  },
  {
    path: "/about/topics/",
    resource: "https://flowcoop.eu/about/topics/",
    template: "/about/topics/index.template.html",
    css: "/styles/site.css",
    text: ["About Flow: Topics", "Proposed topics"],
  },
  {
    path: "/topics/task_management/",
    resource: "https://flowcoop.eu/topics/task_management/",
    template: "/topics/task_management/index.template.html",
    css: "/styles/topic.css",
    text: ["Why?", "Flows", "Tools"],
  },
];
const results = document.querySelector("#results");
let failures = 0;
const encounteredFlowElements = new Set();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function elementsIn(root) {
  const elements = [...root.querySelectorAll("*")];
  for (const template of root.querySelectorAll("template")) {
    elements.push(...elementsIn(template.content));
  }
  return elements;
}

function authoredText(root) {
  const templateText = elementsIn(root)
    .filter(element => element.localName === "template")
    .map(template => template.content.textContent);
  return [root.textContent, ...templateText].join(" ");
}

async function fetchText(path) {
  const response = await fetch(path);
  assert(response.ok, `${path} returned HTTP ${response.status}`);
  return response.text();
}

async function loadTemplateGraph(pagePath) {
  const fragments = new Map();
  const pending = [pagePath];
  while (pending.length > 0) {
    const path = pending.shift();
    if (fragments.has(path)) continue;
    templateUrl(path);
    const fragment = validatedTemplateFragment(
      await fetchText(path),
      new URL(path, location.href),
    );
    fragments.set(path, fragment);
    for (const element of elementsIn(fragment)) {
      if (element.localName.startsWith("flow-") || element.localName === "import-html") {
        encounteredFlowElements.add(element.localName);
      }
      if (element.localName !== "import-html") continue;
      const src = element.getAttribute("src");
      templateUrl(src);
      if (src.startsWith("/templates/")) pending.push(src);
    }
  }
  return fragments;
}

async function testRoute(route) {
  const shell = new DOMParser().parseFromString(
    await fetchText(`${route.path}index.html`),
    "text/html",
  );
  const scripts = shell.querySelectorAll("head > script[src]");
  const styles = shell.querySelectorAll('head > link[rel="stylesheet"]');
  assert(scripts.length === 1, "shell does not have exactly one loader");
  assert(
    scripts[0].getAttribute("src") === "/components/load.js",
    "shell loader differs",
  );
  assert(styles.length === 1, "shell does not have exactly one CSS entry");
  assert(styles[0].getAttribute("href") === route.css, "shell CSS entry differs");

  const initialResource = shell.querySelector(
    "pos-router > pos-resource > import-html",
  );
  assert(initialResource, "initial template import is missing");
  assert(initialResource.parentElement.getAttribute("uri") === route.resource,
    "initial resource differs");
  assert(initialResource.getAttribute("src") === route.template,
    "page template differs");
  assert(initialResource.querySelector("[data-template-loading]"),
    "shell loading state is missing");
  assert(initialResource.querySelector(":scope > template[data-error-template]"),
    "shell error fallback is missing");

  const fragments = await loadTemplateGraph(route.template);
  const page = fragments.get(route.template);
  const context = page.querySelector("flow-version-context");
  assert(context, "page version context is missing");
  assert(!context.hasAttribute("uri"), "page duplicates the shell resource");
  assert(context.hasAttribute("provenance-uri"), "supplementary provenance is missing");
  assert(page.querySelector("[data-version-loading][hidden]"),
    "authored version loading state is missing");
  assert(page.querySelector("[data-version-error][hidden]"),
    "authored version error state is missing");
  const pageText = authoredText(page);
  const missingText = route.text.filter(value => !pageText.includes(value));
  assert(missingText.length === 0,
    `readable page content is missing: ${missingText.join(", ")}`);
  assert(page.querySelector("h1"), "page heading is missing");
  assert(
    elementsIn(page).some(element =>
      element.matches('import-html[src="/templates/discussion/section.html"]'),
    ),
    "shared discussion section is missing",
  );

  const discussion = fragments.get("/templates/discussion/section.html");
  const header = fragments.get("/templates/discussion/header.html");
  const outbox = fragments.get("/templates/discussion/outbox.html");
  assert(
    elementsIn(discussion).some(element =>
      element.matches('import-html[src="/templates/discussion/header.html"]'),
    ),
    "discussion header import is missing",
  );
  assert(header.textContent.includes("Open discussion"),
    "shared discussion heading is missing");
  assert(header.querySelector("[data-trigger]"),
    "shared discussion control is missing");
  assert(outbox.querySelector("[data-loading][hidden]"),
    "discussion loading state is missing");
  assert(outbox.querySelector("[data-empty][hidden]"),
    "discussion empty state is missing");
  assert(outbox.querySelector("[data-error][hidden]"),
    "discussion error state is missing");

  for (const fragment of fragments.values()) {
    for (const state of elementsIn(fragment).filter(element =>
      [...element.attributes].some(attribute =>
        attribute.name.startsWith("data-error") &&
        attribute.name !== "data-error-template",
      ),
    )) {
      assert(state.textContent.trim(), "authored error state has no message");
    }
  }
}

for (const route of routes) {
  const item = document.createElement("li");
  try {
    await testRoute(route);
    item.textContent = `PASS: ${route.path}`;
  } catch (error) {
    failures += 1;
    item.textContent = `FAIL: ${route.path}: ${error.message}`;
  }
  results.append(item);
}

const componentItem = document.createElement("li");
try {
  const host = document.createElement("div");
  for (const tagName of encounteredFlowElements) {
    assert(componentRegistry[tagName], `${tagName} is not registered`);
    host.append(document.createElement(tagName));
  }
  const loader = createComponentLoader();
  await loader.scheduleScan(host);
  for (const tagName of encounteredFlowElements) {
    const entry = componentRegistry[tagName];
    if (entry.provider === "flow" || entry.provider === "flow-bootstrap") {
      assert(customElements.get(tagName), `${tagName} implementation did not register`);
    }
  }
  componentItem.textContent = "PASS: route Flow components register";
} catch (error) {
  failures += 1;
  componentItem.textContent = `FAIL: route Flow components register: ${error.message}`;
}
results.append(componentItem);

document.body.dataset.status = failures === 0 ? "passed" : "failed";
document.title = failures === 0 ? "PASS" : `FAIL (${failures})`;
