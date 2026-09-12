import { componentRegistry } from "./registry.js";

function reportLoadError(target, tagName, code, error) {
  target.dispatchEvent(
    new CustomEvent("flow:error", {
      bubbles: true,
      composed: true,
      detail: { component: tagName, code, error },
    }),
  );
}

/**
 * Creates a serialized custom-element loader. Each scan preserves DOM order,
 * which means an encountered parent is upgraded before its descendants.
 */
export function createComponentLoader({
  registry = componentRegistry,
  importer = specifier => import(specifier),
} = {}) {
  const moduleImports = new Map();
  const tagLoads = new Map();
  let scanQueue = Promise.resolve();

  async function loadElement(element) {
    const tagName = element.localName;
    const entry = registry[tagName];
    if (!entry?.module || entry.provider !== "flow") return;
    if (customElements.get(tagName)) return;

    let load = tagLoads.get(tagName);
    if (!load) {
      load = (async () => {
        let moduleImport = moduleImports.get(entry.module);
        if (!moduleImport) {
          moduleImport = importer(entry.module);
          moduleImports.set(entry.module, moduleImport);
        }
        await moduleImport;
        if (!customElements.get(tagName)) {
          const error = new Error(`${entry.module} did not define <${tagName}>.`);
          error.code = "component-not-defined";
          throw error;
        }
      })();
      tagLoads.set(tagName, load);
    }

    try {
      await load;
    } catch (error) {
      reportLoadError(
        element,
        tagName,
        error.code || "component-load-failed",
        error,
      );
    }
  }

  async function scan(root) {
    const elements = [];
    if (root instanceof Element) elements.push(root);
    if (root?.querySelectorAll) elements.push(...root.querySelectorAll("*"));
    for (const element of elements) await loadElement(element);
  }

  function scheduleScan(root) {
    scanQueue = scanQueue.then(() => scan(root));
    return scanQueue;
  }

  return {
    moduleImports,
    scheduleScan,
    whenIdle: () => scanQueue,
  };
}

export function observeRegisteredElements(root, loader = createComponentLoader()) {
  const scanRoot = root instanceof Document ? root.documentElement : root;
  void loader.scheduleScan(scanRoot);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) void loader.scheduleScan(node);
      }
    }
  });
  observer.observe(scanRoot, { childList: true, subtree: true });
  return { loader, disconnect: () => observer.disconnect() };
}
