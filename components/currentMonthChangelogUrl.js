export function currentMonthChangelogUrl(draftUrl, date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const url = new URL(draftUrl);
  url.pathname = url.pathname.replace(
    /\/history\/draft\/?$/,
    `/history/changelog/${yyyy}/${mm}`,
  );
  return url.href;
}
