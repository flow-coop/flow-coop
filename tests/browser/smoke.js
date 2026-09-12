const allRoutes = [
  { path: "/", discussion: true, text: ["Flow coop", "About", "Topics"] },
  { path: "/about/flows/", text: ["About Flow: Flows", "Existing flows", "Changes"] },
  { path: "/about/tools/", text: ["About Flow: Tools", "Changes"] },
  { path: "/about/topics/", discussion: true, comments: true, text: ["About Flow: Topics", "Proposed topics", "Open discussion", "Contribute from the Fediverse", "Reply from the Fediverse", "Changes"] },
  { path: "/topics/task_management/", discussion: true, comments: true, taskHistory: true, text: ["This version", "Task management", "Why?", "Flows", "Tools", "Open discussion", "Contribute from the Fediverse", "Reply from the Fediverse", "Changes"] },
];
const routeFilter = new URLSearchParams(location.search).get("route");
const routes = routeFilter
  ? allRoutes.filter(route => route.path === routeFilter)
  : allRoutes;
const incorporatedTaskNotes = [
  "117116262041398775",
  "117116293386353207",
  "117116304491150823",
  "117133369969380514",
  "117133374863355352",
  "117133378229611560",
  "117133392772393654",
  "117133425566377347",
];
const openTaskNotes = [
  "117116322505159764",
  "117116340808425129",
  "117133422033259970",
  "117211984867595038",
  "117223553798307518",
];
const results = document.querySelector("#results");
let failures = 0;
const failureMessages = [];

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(check, label, timeout = 60_000) {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    const value = check();
    if (value) return value;
    await wait(100);
  }
  throw new Error(`${label} timed out`);
}

async function loadRoute(route, width) {
  const frame = document.createElement("iframe");
  frame.title = "Route under test";
  frame.style.width = `${width}px`;
  frame.style.height = "900px";
  frame.src = route.path;
  document.body.append(frame);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("navigation timed out")), 15_000);
    frame.addEventListener("load", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
  const doc = frame.contentDocument;
  await waitFor(
    () => doc.querySelector("pos-router > pos-resource > import-html[ready]"),
    "page template",
  );
  await waitFor(
    () => route.text.every(value => doc.body.innerText.includes(value)),
    "visible content",
  );
  if (route.discussion) {
    await waitFor(() => {
      const collection = doc.querySelector("flow-collection-pages");
      return route.comments
        ? collection?.hasAttribute("ready")
        : collection?.hasAttribute("ready") || collection?.hasAttribute("error");
    }, "discussion collection");
    if (route.comments && !doc.querySelector(".flow-comment-card")) {
      throw new Error("discussion comments did not render");
    }
  }
  if (route.taskHistory) {
    await waitFor(
      () => doc.querySelectorAll("flow-if-open[open], flow-if-open[closed]").length === 13,
      "task discussion filtering",
    );
    await waitFor(
      () => doc.querySelectorAll(".flow-changes .flow-comment-card").length === 8,
      "incorporated task content",
    );
    const stateFor = id =>
      doc.querySelector(`flow-if-open[uri$="${id}"]`)?.hasAttribute("open")
        ? "open"
        : doc.querySelector(`flow-if-open[uri$="${id}"]`)?.hasAttribute("closed")
          ? "closed"
          : "missing";
    for (const id of incorporatedTaskNotes) {
      if (stateFor(id) !== "closed") throw new Error(`${id} was not filtered`);
    }
    for (const id of openTaskNotes) {
      if (stateFor(id) !== "open") throw new Error(`${id} was not left open`);
    }
    if (doc.querySelectorAll(".flow-comment-list .flow-comment-card").length !== 5) {
      throw new Error("open discussion does not contain exactly five comments");
    }
    if (doc.querySelectorAll(".flow-change-inputs-title").length !== 1) {
      throw new Error("incorporated content heading was repeated");
    }
  }

  const shellScripts = [...doc.querySelectorAll("head > script[src]")];
  const shellStyles = [...doc.querySelectorAll("head > link[rel=stylesheet]")];
  if (shellScripts.length !== 1 || !shellScripts[0].src.endsWith("/components/load.js")) {
    throw new Error("page does not have exactly one loader");
  }
  if (shellStyles.length !== 1) throw new Error("page does not have exactly one CSS entry");
  if (doc.querySelector("import-html[error], [data-version-error]:not([hidden])")) {
    throw new Error("template or version context failed");
  }
  const flowSelector = "flow-version-context, flow-collection-pages, flow-if-open, flow-sanitized-content, flow-fediverse-interaction";
  await waitFor(
    () => [...doc.querySelectorAll(flowSelector)].every(element =>
      frame.contentWindow.customElements.get(element.localName)),
    "lazy component registration",
  );
  for (const element of doc.querySelectorAll(flowSelector)) {
    if (!frame.contentWindow.customElements.get(element.localName)) {
      throw new Error(`${element.localName} was not registered`);
    }
  }
  const context = doc.querySelector("flow-version-context");
  if (!context?.getAttribute("uri") || !context?.getAttribute("provenance-uri")) {
    throw new Error("explicit RDF context is missing");
  }
  if (
    route.taskHistory &&
    context.getAttribute("provenance-uri") !== "/topics/task_management/index.ttl"
  ) {
    throw new Error("task provenance does not use the tested page resource");
  }
  const discussion = doc.querySelector(".flow-discussion");
  if (route.discussion) {
    if (!discussion) throw new Error("discussion section was not instantiated");
    if (!discussion.querySelector("pos-resource .flow-discussion-header")) {
      throw new Error("actor context did not reach the discussion header");
    }
    if (!discussion.querySelector("pos-resource flow-collection-pages")) {
      throw new Error("outbox context did not reach the collection");
    }
  }
  if (doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 1) {
    throw new Error(`${width}px document overflows horizontally`);
  }
  const scroller = doc.querySelector("ion-content")?.shadowRoot?.querySelector(".inner-scroll");
  if (scroller && scroller.scrollWidth > scroller.clientWidth + 1) {
    throw new Error(`${width}px layout overflows horizontally`);
  }
  frame.remove();
}

for (const route of routes) {
  const item = document.createElement("li");
  try {
    await loadRoute(route, 1280);
    await loadRoute(route, 390);
    item.textContent = `PASS: ${route.path} desktop and mobile`;
  } catch (error) {
    failures += 1;
    failureMessages.push(`${route.path}: ${error.message}`);
    item.textContent = `FAIL: ${route.path}: ${error.message}`;
  }
  document.querySelectorAll("iframe").forEach(element => element.remove());
  results.append(item);
}

document.body.dataset.status = failures === 0 ? "passed" : "failed";
document.title = failures === 0 ? "PASS" : `FAIL: ${failureMessages.join("; ")}`;
