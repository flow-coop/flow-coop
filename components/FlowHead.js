export class FlowHead extends HTMLElement {
    connectedCallback() {
        const title = this.getAttribute("title");
        if (title) {
            document.title = title;
        }

        const DOMPurify = document.createElement("script");
        DOMPurify.src = "/components/vendor/DOMPurify-3.4.14.min.js";
        DOMPurify.integrity = "sha384-46dPGH1XlTmj7bc50bqLjTdORXs/3EP2QpA/6EWbelYWOY9VGp+87RT61S3Mcslb";

        addMeta("viewport", "width=device-width, initial-scale=1.0");
        addMeta("color-scheme", "dark light")
        addLink("stylesheet", "https://cdn.jsdelivr.net/npm/@ionic/core@9.0.0/css/palettes/dark.system.css");
        addLink("stylesheet", "https://cdn.jsdelivr.net/npm/@ionic/core@9.0.0/css/ionic.bundle.css" );
        addLink("stylesheet", "https://cdn.jsdelivr.net/npm/@pod-os/elements@0.43.0/dist/elements/elements.css");
        addLink("stylesheet", "/styles/flow.css");
    }
}

customElements.define("flow-head", FlowHead)


function addMeta(name, content) {
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    document.head.append(meta);
}

function addLink(rel, href) {
    const link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    document.head.append(link);
}