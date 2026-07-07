import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { canManageIntegrations } from "@/lib/admin-permissions";
import { exchangeGa4Code, fetchGoogleEmail, listGa4Properties, resolveOrigin } from "@/lib/ga4-oauth";
import { replaceGa4Properties, saveGa4Connection } from "@/lib/admin-store";

const STATE_COOKIE = "ga4_oauth_state";

function redirectWithStatus(origin: string, status: "connected" | "error", message?: string) {
  const url = new URL("/admin/integrations", origin);
  url.searchParams.set("ga4", status);
  if (message) url.searchParams.set("ga4_message", message);
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
    const tokens = await exchangeGa4Code(origin, code);
    if (!tokens.refresh_token) {
      // Happens if the account already granted consent without `prompt=consent` sticking; ask them to redo it.
      return redirectWithStatus(origin, "error", "no_refresh_token");
    }
    const email = await fetchGoogleEmail(tokens.access_token);
    const properties = await listGa4Properties(tokens.access_token);

    await saveGa4Connection({ connectedEmail: email, refreshToken: tokens.refresh_token, scope: tokens.scope });
    await replaceGa4Properties(properties.map((p) => ({ propertyId: p.propertyId, name: p.displayName, domain: p.domain })));

    return redirectWithStatus(origin, "connected");
  } catch (err) {
    console.error("GA4 OAuth callback failed", err);
    const detail = err instanceof Error ? err.message : String(err);
    return redirectWithStatus(origin, "error", detail.slice(0, 300));
  }
}
