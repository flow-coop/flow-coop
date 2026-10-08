function pageRoot(pathname) {
  const historyIndex = pathname.indexOf("/history/");
  if (historyIndex !== -1) {
    return pathname.slice(0, historyIndex + 1);
  }
  const withoutIndex = pathname.replace(/index\.html?$/i, "");
  return withoutIndex.endsWith("/") ? withoutIndex : `${withoutIndex}/`;
}

export function currentMonthChangelogUrl(pageUrl, date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const url = new URL(pageUrl);
  url.pathname = `${pageRoot(url.pathname)}history/changelog/${yyyy}/${mm}`;
  url.search = "";
  url.hash = "";
  return url.href;
}
