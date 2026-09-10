import { ReceiveResourceOS } from "./ReceiveResourceOS.js";

const AS_PREFERRED_USERNAME =
  "https://www.w3.org/ns/activitystreams#preferredUsername";
const AS_URL = "https://www.w3.org/ns/activitystreams#url";
const FEP_CREATE = "https://w3id.org/fep/3b86/Create";
const FEP_OBJECT = "https://w3id.org/fep/3b86/Object";
const OSTATUS_SUBSCRIBE = "http://ostatus.org/schema/1.0/subscribe";
const STORAGE_KEY = "flow:fediverse-account:v1";
const REQUEST_TIMEOUT_MS = 8_000;

function publicHost(value) {
  if (!value || /[\s/:?#@[\]]/u.test(value)) {
    throw new Error("The account server must be a public hostname.");
  }
  const url = new URL(`https://${value}`);
  const hostname = url.hostname.toLowerCase();
  const domain =
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
  if (
    url.host !== value.toLowerCase() ||
    hostname === "localhost" ||
    !domain.test(hostname) ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)
  ) {
    throw new Error("The account server must be a public hostname.");
  }
  return hostname;
}

export function parseFediverseAccount(value) {
  const input = String(value || "").trim();
  const withoutPrefix = input.startsWith("@") ? input.slice(1) : input;
  const separator = withoutPrefix.lastIndexOf("@");
  if (separator <= 0 || separator === withoutPrefix.length - 1) {
    throw new Error("Enter a complete Fediverse address.");
  }
  const username = withoutPrefix.slice(0, separator);
  if (!username || /[\s@/<>]/u.test(username)) {
    throw new Error("Enter a valid Fediverse username.");
  }
  const host = publicHost(withoutPrefix.slice(separator + 1));
  return {
    username,
    host,
    resource: `acct:${username}@${host}`,
    display: `@${username}@${host}`,
    origin: `https://${host}`,
  };
}

export function webfingerUrl(account) {
  const url = new URL("/.well-known/webfinger", account.origin);
  url.searchParams.set("resource", account.resource);
  return url.href;
}

function advertisedTemplate(links, relation, requiredVariable) {
  return links.find(link =>
    link?.rel === relation &&
    typeof link.template === "string" &&
    (!requiredVariable || link.template.includes(`{${requiredVariable}}`)),
  )?.template;
}

export function expandIntentTemplate(template, values) {
  let replacements = 0;
  const expanded = template.replace(/\{([^{}]+)\}/gu, (_match, name) => {
    replacements += 1;
    const value = Object.hasOwn(values, name) ? values[name] : "";
    return encodeURIComponent(String(value ?? ""));
  });
  if (replacements === 0 || /[{}]/u.test(expanded)) {
    throw new Error("The advertised interaction template is invalid.");
  }
  const destination = new URL(expanded);
  if (
    destination.protocol !== "https:" ||
    destination.username ||
    destination.password
  ) {
    throw new Error("The advertised interaction destination is unsafe.");
  }
  return destination.href;
}

export function resolveInteractionIntent(mode, links, values) {
  let template;
  let templateValues;
  if (mode === "reply") {
    template = advertisedTemplate(links, FEP_CREATE, "inReplyTo");
    templateValues = {
      content: "",
      inReplyTo: values.object,
      object: values.object,
      type: "Note",
    };
    if (!template) {
      template = advertisedTemplate(links, FEP_OBJECT, "object");
      templateValues = { object: values.object };
    }
    if (!template) {
      template = advertisedTemplate(links, OSTATUS_SUBSCRIBE, "uri");
      templateValues = { uri: values.object };
    }
  } else if (mode === "contribute") {
    template = advertisedTemplate(links, FEP_CREATE, "content");
    templateValues = { content: values.content, type: "Note" };
  } else {
    throw new Error(`Unsupported interaction mode: ${mode}`);
  }
  if (!template) return null;
  return expandIntentTemplate(template, templateValues);
}

function relationUri(resource, predicate) {
  return resource?.relations(predicate).flatMap(relation => relation.uris)[0];
}

function safeHttpUrl(value) {
  const url = new URL(value);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new Error("The resource URL is unsafe.");
  }
  return url;
}

function matchingSubject(actual, account) {
  if (typeof actual !== "string" || !actual.startsWith("acct:")) return false;
  return actual.toLowerCase() === account.resource.toLowerCase();
}

export class FlowFediverseInteraction extends ReceiveResourceOS {
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("click", this);
    this.addEventListener("keydown", this);
    this.addEventListener("cancel", this, true);
    this.restoreAccount();
    this.setState("idle");
    this.update();
  }

  disconnectedCallback() {
    clearTimeout(this._osTimer);
    this.cancelRequest();
    this.removeEventListener("click", this);
    this.removeEventListener("keydown", this);
    this.removeEventListener("cancel", this, true);
  }

  handleEvent(event) {
    if (event.type === "keydown") {
      if (
        event.key === "Enter" &&
        event.target === this.querySelector(":scope [data-account]")
      ) {
        event.preventDefault();
        void this.continue();
      }
      return;
    }
    if (event.type === "cancel") {
      event.preventDefault();
      this.closeDialog();
      return;
    }
    const action = event.target?.closest?.(
      "[data-trigger], [data-continue], [data-cancel], [data-forget], [data-copy]",
    );
    if (!action || !this.contains(action)) return;
    if (action.matches("[data-trigger]")) this.openDialog();
    if (action.matches("[data-continue]")) void this.continue();
    if (action.matches("[data-cancel]")) this.closeDialog();
    if (action.matches("[data-forget]")) this.forgetAccount();
    if (action.matches("[data-copy]")) void this.copyFallback();
  }

  update() {
    if (!this.resource?.uri) return false;
    const original = this.querySelector(":scope [data-original]");
    if (original) {
      try {
        original.href = safeHttpUrl(
          relationUri(this.resource, AS_URL) || this.resource.uri,
        ).href;
        original.target = "_blank";
        original.rel = "noopener noreferrer";
      } catch (error) {
        original.removeAttribute("href");
        this.reportError("unsafe-resource", error);
        return false;
      }
    }
    this.setAttribute("ready", "");
    return true;
  }

  openDialog() {
    this.restoreAccount();
    this.setState("idle");
    const dialog = this.querySelector(":scope [data-dialog]");
    if (!dialog) {
      this.reportError("missing-ui", new Error("Interaction dialog is missing."));
      return;
    }
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    this.querySelector(":scope [data-account]")?.focus();
  }

  closeDialog() {
    this.cancelRequest();
    const dialog = this.querySelector(":scope [data-dialog]");
    if (typeof dialog?.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
    this.setState("idle");
  }

  restoreAccount() {
    const input = this.querySelector(":scope [data-account]");
    const forget = this.querySelector(":scope [data-forget]");
    let saved = "";
    try {
      saved = localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      // Storage is optional; interaction still works in restricted modes.
    }
    if (input && saved) input.value = saved;
    if (forget) forget.hidden = !saved;
    return saved;
  }

  rememberAccount(account) {
    try {
      localStorage.setItem(STORAGE_KEY, account.display);
      const forget = this.querySelector(":scope [data-forget]");
      if (forget) forget.hidden = false;
    } catch {
      // Storage can be unavailable without blocking the redirect.
    }
  }

  forgetAccount() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Keep the control functional when storage access is restricted.
    }
    const input = this.querySelector(":scope [data-account]");
    const forget = this.querySelector(":scope [data-forget]");
    if (input) input.value = "";
    if (forget) forget.hidden = true;
    input?.focus();
  }

  interactionValues(mode) {
    if (!this.resource?.uri) {
      throw new Error("Interaction resource is not available.");
    }
    if (mode === "reply") return { object: this.resource.uri };
    const versionUri = this.closest("flow-version-context")?.getAttribute("uri");
    if (!versionUri) throw new Error("Version context is not available.");
    const preferredUsername = this.resource.anyValue(AS_PREFERRED_USERNAME);
    const actor = safeHttpUrl(this.resource.uri);
    const reference = preferredUsername
      ? `@${preferredUsername}@${actor.hostname}`
      : actor.href;
    return { content: `${reference} ${versionUri}` };
  }

  async continue() {
    const input = this.querySelector(":scope [data-account]");
    let account;
    try {
      account = parseFediverseAccount(input?.value);
    } catch (error) {
      this.reportError("invalid-account", error);
      return false;
    }
    const mode = this.getAttribute("mode") || "contribute";
    if (mode !== "reply" && mode !== "contribute") {
      this.reportError(
        "missing-context",
        new Error(`Unsupported interaction mode: ${mode}`),
      );
      return false;
    }
    let values;
    try {
      values = this.interactionValues(mode);
    } catch (error) {
      this.reportError("missing-context", error);
      return false;
    }

    this.setState("resolving");
    const controller = new AbortController();
    this.cancelRequest();
    this._requestController = controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(webfingerUrl(account), {
        credentials: "omit",
        headers: { Accept: "application/jrd+json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`WebFinger returned HTTP ${response.status}.`);
      }
      let document;
      try {
        document = await response.json();
      } catch (error) {
        this.prepareFallback(mode, values, account);
        this.reportError("invalid-response", error);
        return false;
      }
      if (
        !matchingSubject(document?.subject, account) ||
        !Array.isArray(document?.links)
      ) {
        this.prepareFallback(mode, values, account);
        this.reportError(
          "invalid-response",
          new Error("WebFinger response does not match the account."),
        );
        return false;
      }
      this.rememberAccount(account);
      let destination;
      try {
        destination = resolveInteractionIntent(mode, document.links, values);
      } catch (error) {
        this.prepareFallback(mode, values, account);
        this.reportError("unsafe-destination", error);
        return false;
      }
      if (!destination) {
        this.prepareFallback(mode, values, account);
        this.reportError(
          "unsupported",
          new Error("The server advertises no compatible interaction."),
        );
        return false;
      }
      this.setState("ready");
      this.navigate(destination);
      return true;
    } catch (error) {
      if (controller.signal.aborted && this._requestController !== controller) {
        return false;
      }
      if (controller.signal.aborted) {
        this.reportError(
          "unavailable",
          new Error("WebFinger request timed out."),
        );
      } else {
        this.reportError("unavailable", error);
      }
      this.prepareFallback(mode, values, account);
      return false;
    } finally {
      clearTimeout(timeout);
      if (this._requestController === controller) this._requestController = null;
    }
  }

  cancelRequest() {
    const controller = this._requestController;
    this._requestController = null;
    controller?.abort();
  }

  prepareFallback(mode, values, account) {
    const fallback = this.querySelector(":scope [data-fallback]");
    const openServer = this.querySelector(":scope [data-open-server]");
    if (fallback) fallback.hidden = false;
    if (openServer) {
      openServer.href = account.origin;
      openServer.target = "_blank";
      openServer.rel = "noopener noreferrer";
    }
    this._fallbackText = mode === "reply" ? values.object : values.content;
  }

  async copyFallback() {
    if (!this._fallbackText) return false;
    try {
      await navigator.clipboard.writeText(this._fallbackText);
      this.setAttribute("copied", "");
      return true;
    } catch (error) {
      this.reportError("copy-failed", error);
      return false;
    }
  }

  setState(state) {
    for (const name of ["idle", "resolving", "ready"]) {
      this.toggleAttribute(name, name === state);
    }
    if (state !== "error") this.removeAttribute("error");
    if (state === "idle") {
      this.removeAttribute("copied");
      const fallback = this.querySelector(":scope [data-fallback]");
      if (fallback) fallback.hidden = true;
    }
    const button = this.querySelector(":scope [data-continue]");
    if (button) button.disabled = state === "resolving";
    for (const status of this.querySelectorAll(":scope [data-status-for]")) {
      status.hidden = status.getAttribute("data-status-for") !== state;
    }
    for (const message of this.querySelectorAll(":scope [data-error-for]")) {
      message.hidden = true;
    }
  }

  reportError(code, error) {
    this.setState("error");
    this.setAttribute("error", code);
    const button = this.querySelector(":scope [data-continue]");
    if (button) button.disabled = false;
    for (const message of this.querySelectorAll(":scope [data-error-for]")) {
      message.hidden = message.getAttribute("data-error-for") !== code;
    }
    this.dispatchEvent(
      new CustomEvent("flow:error", {
        bubbles: true,
        detail: { component: "flow-fediverse-interaction", code, error },
      }),
    );
  }

  navigate(destination) {
    window.location.assign(destination);
  }
}

if (!customElements.get("flow-fediverse-interaction")) {
  customElements.define(
    "flow-fediverse-interaction",
    FlowFediverseInteraction,
  );
}
