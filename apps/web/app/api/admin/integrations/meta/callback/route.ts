import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { canManageIntegrations } from "@/lib/admin-permissions";
import { exchangeForLongLivedToken, exchangeMetaCode, fetchFacebookUser, listMetaAdAccounts, resolveOrigin } from "@/lib/meta-oauth";
import { replaceMetaAdAccounts, saveMetaConnection } from "@/lib/admin-store";

const STATE_COOKIE = "meta_oauth_state";

function redirectWithStatus(origin: string, status: "connected" | "error", message?: string) {
  const url = new URL("/admin/integrations", origin);
  url.searchParams.set("meta", status);
  if (message) url.searchParams.set("meta_message", message);
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
  const error = searchParams.get("error") ?? searchParams.get("error_description");
  if (error) return redirectWithStatus(origin, "error", error);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithStatus(origin, "error", "invalid_state");
  }

  try {
    const shortLived = await exchangeMetaCode(origin, code);
    const { accessToken, expiresIn } = await exchangeForLongLivedToken(shortLived.access_token);
    const user = await fetchFacebookUser(accessToken);
    const accounts = await listMetaAdAccounts(accessToken);

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    await saveMetaConnection({ connectedName: user.name, accessToken, expiresAt });
    await replaceMetaAdAccounts(accounts.map((a) => ({ accountId: a.accountId, name: a.name, currency: a.currency })));

    return redirectWithStatus(origin, "connected");
  } catch (err) {
    console.error("Meta OAuth callback failed", err);
    const detail = err instanceof Error ? err.message : String(err);
    return redirectWithStatus(origin, "error", detail.slice(0, 300));
  }
}
