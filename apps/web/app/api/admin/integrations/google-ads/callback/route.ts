import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { canManageIntegrations } from "@/lib/admin-permissions";
import { exchangeGoogleAdsCode, fetchGoogleEmail, listGoogleAdsAccounts, resolveOrigin } from "@/lib/google-ads-oauth";
import { replaceGoogleAdsAccounts, saveGoogleAdsConnection } from "@/lib/admin-store";

const STATE_COOKIE = "google_ads_oauth_state";

function redirectWithStatus(origin: string, status: "connected" | "error", message?: string) {
  const url = new URL("/admin/integrations", origin);
  url.searchParams.set("google", status);
  if (message) url.searchParams.set("google_message", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session || session.role === "client" || !canManageIntegrations(session.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const origin = resolveOrigin(request);
  const { searchParams } = request.nextUrl;
  const error = searchParams.get("error");
  if (error) return redirectWithStatus(origin, "error", error);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithStatus(origin, "error", "invalid_state");
  }

  try {
    const tokens = await exchangeGoogleAdsCode(origin, code);
    if (!tokens.refresh_token) {
      return redirectWithStatus(origin, "error", "no_refresh_token");
    }
    const email = await fetchGoogleEmail(tokens.access_token);
    const accounts = await listGoogleAdsAccounts(tokens.access_token);

    await saveGoogleAdsConnection({ connectedEmail: email, refreshToken: tokens.refresh_token, scope: tokens.scope });
    await replaceGoogleAdsAccounts(accounts);

    return redirectWithStatus(origin, "connected");
  } catch (err) {
    console.error("Google Ads OAuth callback failed", err);
    const detail = err instanceof Error ? err.message : String(err);
    return redirectWithStatus(origin, "error", detail.slice(0, 300));
  }
}
