const routes = [
  { path: "/", discussion: true, text: ["Flow coop", "About", "Topics"] },
  { path: "/about/flows/", text: ["About Flow: Flows", "Existing flows", "Changes"] },
  { path: "/about/tools/", text: ["About Flow: Tools", "Changes"] },
  { path: "/about/topics/", discussion: true, comments: true, text: ["About Flow: Topics", "Proposed topics", "Open discussion", "Contribute from the Fediverse", "Reply from the Fediverse", "Changes"] },
  { path: "/topics/task_management/", discussion: true, comments: true, text: ["This version", "Task management", "Why?", "Flows", "Tools", "Open discussion", "Contribute from the Fediverse", "Reply from the Fediverse", "Changes"] },
];
const results = document.querySelector("#results");
let failures = 0;

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
    item.textContent = `FAIL: ${route.path}: ${error.message}`;
  }
  document.querySelectorAll("iframe").forEach(element => element.remove());
  results.append(item);
}

document.body.dataset.status = failures === 0 ? "passed" : "failed";
document.title = failures === 0 ? "PASS" : `FAIL (${failures})`;
