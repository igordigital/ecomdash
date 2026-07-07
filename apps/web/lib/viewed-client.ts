import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth";
import { getClients } from "./admin-store";

/** Fallback when nothing else applies (no session, or staff not previewing anyone): the earliest-created active client. */
async function getDefaultClientId(): Promise<string> {
  const clients = await getClients();
  return (clients.find((c) => c.status === "active") ?? clients[0])?.id ?? "";
}

/**
 * Resolves which client's data a dashboard page should render. A real
 * Client-role session always sees their own assigned client, never
 * overridable by query params. An Admin/Analyst session sees whichever
 * client is selected via the dashboard's client switcher (?clientId=...),
 * falling back to the default demo client when not previewing anyone.
 */
export async function resolveViewedClientId(searchParamsClientId?: string): Promise<string> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (session?.role === "client") return session.clientId ?? (await getDefaultClientId());
  if (searchParamsClientId) return searchParamsClientId;
  return getDefaultClientId();
}
