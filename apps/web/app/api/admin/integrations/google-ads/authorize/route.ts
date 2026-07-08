import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { canManageIntegrations } from "@/lib/admin-permissions";
import { buildGoogleAdsAuthUrl, resolveOrigin } from "@/lib/google-ads-oauth";

const STATE_COOKIE = "google_ads_oauth_state";

export async function GET(request: NextRequest) {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session || session.role === "client" || !canManageIntegrations(session.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const state = crypto.randomUUID();
  jar.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });

  const url = buildGoogleAdsAuthUrl(resolveOrigin(request), state);
  return NextResponse.redirect(url);
}
