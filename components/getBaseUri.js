const POD_ORIGIN = "https://flowcoop.eu";

export function getBaseUri(pageBaseURI) {
  const url = new URL(pageBaseURI);

  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return new URL(
      `${url.pathname}${url.search}${url.hash}`,
      POD_ORIGIN,
    ).href;
  }

  return url.href;
}
