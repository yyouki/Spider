/**
 * Resolve Worker-provided share routes against the active Space host.
 * Only same-origin, path-only share URLs are allowed.
 */
export function resolveShareLinks(
  share: { url: string; jsonUrl: string },
  origin: string
): { url: string; jsonUrl: string } {
  const base = new URL(origin);
  const url = new URL(share.url, base);
  const jsonUrl = new URL(share.jsonUrl, base);

  if (
    url.origin !== base.origin ||
    jsonUrl.origin !== base.origin ||
    !/^\/share\/[A-Za-z0-9_-]{43}$/.test(url.pathname) ||
    jsonUrl.pathname !== url.pathname + ".json" ||
    url.search || url.hash || jsonUrl.search || jsonUrl.hash
  ) {
    throw new Error("The share link returned by Space is invalid.");
  }

  return { url: url.toString(), jsonUrl: jsonUrl.toString() };
}
