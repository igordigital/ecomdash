/**
 * Google OAuth for Google Ads (agency-level, single sign-in), same shape as
 * ga4-oauth.ts and reusing the same GOOGLE_OAUTH_CLIENT_ID/SECRET (one
 * Google Cloud OAuth client backs both, just different scopes). The account
 * that completes this flow must have access to the agency's MCC
 * (GOOGLE_ADS_MCC_ID); every account directly under that MCC is what gets
 * listed for clients to be assigned from.
 *
 * Unlike GA4, every real API call also needs a developer token
 * (GOOGLE_ADS_DEVELOPER_TOKEN) issued once via the MCC's API Center, and a
 * login-customer-id header identifying which MCC is doing the asking.
 */

import { fetchGoogleEmail } from "./ga4-oauth";

export { resolveOrigin } from "./oauth-utils";
export { fetchGoogleEmail };

const GOOGLE_ADS_SCOPE = "openid email https://www.googleapis.com/auth/adwords";
const CALLBACK_PATH = "/api/admin/integrations/google-ads/callback";
// Google sunsets an API version roughly a year after release, with no warning here beyond
// a 404 (not a JSON error). v19 was already gone by 2026-07; confirmed v22 is live via a
// direct curl before bumping to it (401 on a dummy token = routable, vs 404 = doesn't exist).
const API_VERSION = "v22";
const API_BASE = `https://googleads.googleapis.com/${API_VERSION}`;

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required");
  }
  return { clientId, clientSecret };
}

/** Digits only, no dashes -- required format for the login-customer-id header and path segments. */
export function normalizedMccId(): string {
  const raw = process.env.GOOGLE_ADS_MCC_ID;
  if (!raw) throw new Error("GOOGLE_ADS_MCC_ID is required");
  return raw.replace(/[^0-9]/g, "");
}

function requireDeveloperToken(): string {
  const token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!token) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is required");
  return token;
}

export function googleAdsRedirectUri(origin: string): string {
  return `${origin}${CALLBACK_PATH}`;
}

export function buildGoogleAdsAuthUrl(origin: string, state: string): string {
  const { clientId } = getClientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleAdsRedirectUri(origin),
    response_type: "code",
    scope: GOOGLE_ADS_SCOPE,
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

export async function exchangeGoogleAdsCode(origin: string, code: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getClientCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: googleAdsRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function refreshGoogleAdsAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
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

interface CustomerClientRow {
  customerClient: {
    clientCustomer: string; // "customers/1234567890"
    descriptiveName?: string;
    currencyCode?: string;
    manager: boolean;
    level: number;
  };
}
interface SearchResponse {
  results?: CustomerClientRow[];
  nextPageToken?: string;
}

export interface GoogleAdsAccountSummary {
  customerId: string; // digits only
  name: string;
  currency: string;
}

/**
 * Walks the MCC's direct client accounts via the customer_client resource
 * (not customers:listAccessibleCustomers, which only returns accounts the
 * OAuth user was individually granted access to -- an agency's real client
 * list lives under the MCC hierarchy instead). level <= 1 keeps this to the
 * MCC itself (0) and its direct children (1); nested sub-manager accounts
 * are excluded client-side since they aren't real ad accounts to assign.
 */
export async function listGoogleAdsAccounts(accessToken: string): Promise<GoogleAdsAccountSummary[]> {
  const mccId = normalizedMccId();
  const developerToken = requireDeveloperToken();
  const accounts: GoogleAdsAccountSummary[] = [];
  let pageToken: string | undefined;

  do {
    const res = await fetch(`${API_BASE}/customers/${mccId}/googleAds:search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "login-customer-id": mccId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query:
          "SELECT customer_client.client_customer, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.level FROM customer_client WHERE customer_client.level <= 1",
        pageToken,
      }),
    });
    if (!res.ok) throw new Error(`Google Ads account list failed: ${res.status} ${await res.text()}`);
    const json: SearchResponse = await res.json();
    for (const row of json.results ?? []) {
      const cc = row.customerClient;
      if (cc.level !== 1 || cc.manager) continue;
      const customerId = cc.clientCustomer.replace("customers/", "");
      accounts.push({ customerId, name: cc.descriptiveName ?? customerId, currency: cc.currencyCode ?? "USD" });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  return accounts;
}
