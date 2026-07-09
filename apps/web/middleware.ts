import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * Login gate for the whole app. Runs on every request except Next internals
 * and endpoints that authenticate with their own shared secret header
 * instead of a user session: api/revalidate, and api/cron/* (called by a
 * scheduled Railway cron service, not a logged-in browser).
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/revalidate|api/cron).*)"],
};

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (pathname === "/login") {
    if (session) {
      const url = req.nextUrl.clone();
      url.pathname = session.role === "client" ? "/" : "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if ((pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) && session.role === "client") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
