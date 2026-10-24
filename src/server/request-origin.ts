/** Next may expose its internal bind address in request.url. Host identifies the requested
 * browser authority; forwarded headers are deliberately not trusted by this local prototype. */
export function isSameOrigin(request: Request): boolean {
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin || suppliedOrigin === "null") return false;
  try {
    const requestUrl = new URL(request.url);
    if (!["http:", "https:"].includes(requestUrl.protocol)) return false;
    const origin = new URL(suppliedOrigin);
    // Origin headers contain exactly a serialized origin, never userinfo, paths or lists.
    if (suppliedOrigin !== origin.origin) return false;
    const host = request.headers.get("host");
    if (host !== null && (!host || /[\s,/@\\?#]/.test(host))) return false;
    const expected = host === null ? requestUrl : new URL(`${requestUrl.protocol}//${host}`);
    return origin.origin === expected.origin;
  } catch { return false; }
}
