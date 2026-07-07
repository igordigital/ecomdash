/**
 * Meta OAuth for ad account access (agency-level, single sign-in), through
 * a dedicated Meta app rather than a Business Manager System User: Igor's
 * call, trading System User tokens' indefinite lifetime for the same
 * "click through a real consent screen" flow already used for GA4. Meta
 * user access tokens (even the long-lived version obtained below) expire
 * after roughly 60 days with no refresh-token grant — there is no silent
 * renewal, only a fresh OAuth round-trip. agency_integrations.external_ref
 * stores the expiry timestamp so the Integrations page can warn before it
 * lapses instead of failing silently.
 */

import { resolveOrigin } from "./oauth-utils";

export { resolveOrigin };

const META_SCOPE = "ads_read";
const CALLBACK_PATH = "/api/admin/integrations/meta/callback";
const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function getAppCredentials(): { appId: string; appSecret: string } {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID and META_APP_SECRET are required");
  return { appId, appSecret };
}

export function metaRedirectUri(origin: string): string {
  return `${origin}${CALLBACK_PATH}`;
}

export function buildMetaAuthUrl(origin: string, state: string): string {
  const { appId } = getAppCredentials();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: metaRedirectUri(origin),
    response_type: "code",
    scope: META_SCOPE,
    state,
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export async function exchangeMetaCode(origin: string, code: string): Promise<MetaTokenResponse> {
  const { appId, appSecret } = getAppCredentials();
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: metaRedirectUri(origin),
    code,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`Meta token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Meta's OAuth redirect returns a short-lived (~1-2h) token; this trades it for the ~60 day long-lived one. */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const { appId, appSecret } = getAppCredentials();
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) throw new Error(`Meta long-lived token exchange failed: ${res.status} ${await res.text()}`);
  const json: MetaTokenResponse = await res.json();
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 60 * 24 * 60 * 60 };
}

export async function fetchFacebookUser(accessToken: string): Promise<{ id: string; name: string }> {
  const res = await fetch(`${GRAPH_BASE}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) throw new Error(`Meta /me failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export interface MetaAdAccountSummary {
  accountId: string; // "act_123456789"
  name: string;
  currency: string;
}

interface AdAccountsResponse {
  data?: { account_id: string; name: string; currency: string }[];
  paging?: { next?: string };
}

export async function listMetaAdAccounts(accessToken: string): Promise<MetaAdAccountSummary[]> {
  const accounts: MetaAdAccountSummary[] = [];
  let url: string | undefined =
    `${GRAPH_BASE}/me/adaccounts?fields=account_id,name,currency&limit=200&access_token=${encodeURIComponent(accessToken)}`;

  for (let page = 0; page < 10 && url; page++) {
    const res: Response = await fetch(url);
    if (!res.ok) throw new Error(`Meta ad accounts list failed: ${res.status} ${await res.text()}`);
    const json: AdAccountsResponse = await res.json();
    for (const a of json.data ?? []) {
      accounts.push({ accountId: `act_${a.account_id}`, name: a.name, currency: a.currency });
    }
    url = json.paging?.next;
  }
  return accounts;
}
