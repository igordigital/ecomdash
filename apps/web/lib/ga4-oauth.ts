/**
 * Google OAuth for GA4 (agency-level, single sign-in). The Google account
 * that completes this flow lists whichever GA4 properties it already has
 * Viewer access to (Google Analytics Admin API); clients are assigned from
 * that list, not through their own OAuth grant. Same Google Cloud OAuth
 * client will later be reused for Google Ads (different scope, same
 * GOOGLE_OAUTH_CLIENT_ID/SECRET), since both just need this one "web app"
 * registered with Google, not a separate one per integration.
 */

// analytics.readonly alone issues a token with no identity info on it at
// all; userinfo then 401s ("missing required authentication credential")
// because the token carries no scope userinfo recognizes. openid+email get
// the connected account's address onto the token too.
const GA4_SCOPE = "openid email https://www.googleapis.com/auth/analytics.readonly";
const CALLBACK_PATH = "/api/admin/integrations/ga4/callback";

/**
 * request.nextUrl.origin reflects the scheme the Next.js server itself saw,
 * which on Railway (and most non-Vercel hosts) is plain http: the platform's
 * edge proxy terminates TLS and forwards to the container over HTTP. Google
 * matches the OAuth redirect_uri byte-for-byte including scheme, so building
 * it from nextUrl.origin silently produces an http:// URI that never matches
 * the https:// one actually registered, failing with redirect_uri_mismatch.
 * Trust the proxy's X-Forwarded-Proto/Host instead, falling back to nextUrl
 * for local dev where there's no proxy in front of it.
 */
export function resolveOrigin(request: { headers: Headers; nextUrl: URL }): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (forwardedProto && forwardedHost) return `${forwardedProto.split(",")[0]}://${forwardedHost}`;
  return request.nextUrl.origin;
}

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required");
  }
  return { clientId, clientSecret };
}

export function ga4RedirectUri(origin: string): string {
  return `${origin}${CALLBACK_PATH}`;
}

export function buildGa4AuthUrl(origin: string, state: string): string {
  const { clientId } = getClientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: ga4RedirectUri(origin),
    response_type: "code",
    scope: GA4_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeGa4Code(origin: string, code: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getClientCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: ga4RedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function refreshGa4AccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const { clientId, clientSecret } = getClientCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  const json: TokenResponse = await res.json();
  return { accessToken: json.access_token, expiresIn: json.expires_in };
}

export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.email;
}

export interface Ga4PropertySummary {
  propertyId: string; // "properties/12345"
  displayName: string;
  domain: string;
}

interface AccountSummariesResponse {
  accountSummaries?: {
    propertySummaries?: { property: string; displayName: string }[];
  }[];
}

interface DataStreamsResponse {
  dataStreams?: { webStreamData?: { defaultUri?: string } }[];
}

/** One extra call per property to resolve its web stream's domain, since accountSummaries doesn't include it. */
async function fetchPropertyDomain(accessToken: string, propertyId: string): Promise<string> {
  const res = await fetch(`https://analyticsadmin.googleapis.com/v1beta/${propertyId}/dataStreams`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "";
  const json: DataStreamsResponse = await res.json();
  return json.dataStreams?.find((s) => s.webStreamData?.defaultUri)?.webStreamData?.defaultUri ?? "";
}

export async function listGa4Properties(accessToken: string): Promise<Ga4PropertySummary[]> {
  const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google Analytics Admin API failed: ${res.status} ${await res.text()}`);
  const json: AccountSummariesResponse = await res.json();
  const properties = (json.accountSummaries ?? []).flatMap((a) => a.propertySummaries ?? []);
  return Promise.all(
    properties.map(async (p) => ({
      propertyId: p.property,
      displayName: p.displayName,
      domain: await fetchPropertyDomain(accessToken, p.property),
    })),
  );
}
