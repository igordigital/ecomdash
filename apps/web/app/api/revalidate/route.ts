import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Called by the daily job after marts rebuild. Because data only changes once
 * per day, dashboard pages cache on the "marts" tag and serve statically
 * between refreshes; this endpoint is the only cache invalidation path.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-revalidate-secret");
  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  revalidateTag("marts");
  return NextResponse.json({ ok: true, revalidated: "marts" });
}
