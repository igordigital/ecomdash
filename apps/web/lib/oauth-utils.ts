/**
 * Shared across every OAuth flow in this app (GA4, Meta, and later Google
 * Ads). request.nextUrl.origin reflects the scheme the Next.js server
 * itself saw, which on Railway (and most non-Vercel hosts) is plain http:
 * the platform's edge proxy terminates TLS and forwards to the container
 * over HTTP. OAuth providers match redirect_uri byte-for-byte including
 * scheme, so building it from nextUrl.origin silently produces an http://
 * URI that never matches the https:// one actually registered, failing
 * with a redirect_uri mismatch. Trust the proxy's X-Forwarded-Proto/Host
 * instead, falling back to nextUrl for local dev where there's no proxy in
 * front of it. (Discovered and fixed once for GA4; reused here so no other
 * OAuth integration has to rediscover it.)
 */
export function resolveOrigin(request: { headers: Headers; nextUrl: URL }): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (forwardedProto && forwardedHost) return `${forwardedProto.split(",")[0]}://${forwardedHost}`;
  return request.nextUrl.origin;
}
