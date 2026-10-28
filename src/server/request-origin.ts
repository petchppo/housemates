type OriginEnvironment = Record<string, string | undefined>;

/** Server configuration may identify TLS terminated before the Next process. These
 * exact origins never authorize cross-host requests or trust browser forwarding headers. */
function trustedHttpsOrigin(origin: string, env: OriginEnvironment): boolean {
  const configured = env.HOUSEMATES_TRUSTED_ORIGINS;
  const origins: string[] = [];
  if (configured !== undefined) {
    if (configured.length > 4096) return false;
    const entries = configured.split(",").map(value => value.trim());
    if (entries.length > 16) return false;
    for (const entry of entries) {
      try {
        const url = new URL(entry);
        if (url.protocol !== "https:" || url.origin !== entry) return false;
        origins.push(entry);
      } catch { return false; }
    }
  }
  // These are server-owned Vercel system variables, not similarly named HTTP headers.
  if (env.VERCEL === "1") for (const key of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) {
    const domain = env[key];
    if (!domain || domain.length > 253 || !/^[a-zA-Z0-9.-]+$/.test(domain)) continue;
    try {
      const url = new URL(`https://${domain}`);
      if (url.hostname === domain.toLowerCase()) origins.push(url.origin);
    } catch { /* Ignore malformed deployment metadata. */ }
  }
  return origins.includes(origin);
}

/** Next may expose its internal bind address in request.url. Host identifies the
 * browser authority. Origin checks prevent browser CSRF; they are not authentication. */
export function isSameOrigin(request: Request, env: OriginEnvironment = process.env): boolean {
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
    if (origin.origin === expected.origin) return true;
    // Only correct HTTP-to-HTTPS termination for this same authority. Even two
    // configured aliases are different origins and cannot post to one another.
    return requestUrl.protocol === "http:" && origin.protocol === "https:" &&
      origin.host === expected.host && trustedHttpsOrigin(origin.origin, env);
  } catch { return false; }
}
