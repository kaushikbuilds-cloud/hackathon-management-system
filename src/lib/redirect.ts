/**
 * Where to send someone after an email link: the requested path on this site,
 * or the fallback. Resolving against the origin and comparing origins also
 * catches tricks like "/\evil.com", which browsers read as "//evil.com".
 */
export function sameSiteUrl(next: string | null, origin: string, fallback: string): URL {
  const home = new URL(fallback, origin);
  if (!next || !next.startsWith("/")) return home;
  try {
    const url = new URL(next, origin);
    return url.origin === home.origin ? url : home;
  } catch {
    return home;
  }
}
