"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, signSession, SESSION_COOKIE, verifyPassword } from "./auth";
import {
  archiveClient,
  assignUserClient,
  connectClientAccount,
  createClientRecord,
  createUserRecord,
  deleteClient,
  findUserByEmail,
  getUser,
  removeUser as removeUserRecord,
  saveShopifyConnection,
  saveWooConnection,
  setUserPassword,
  startBackfill as startBackfillRecord,
  unarchiveClient,
  updateClientBudget,
  type BackfillSourceKey,
  type ConnectablePlatform,
  type Role,
} from "./admin-store";
import { runPendingGa4Jobs } from "./ga4-ingest";
import { runPendingMetaJobs } from "./meta-ingest";
import { runPendingShopifyJobs } from "./shopify-ingest";
import { runPendingWooJobs } from "./woo-ingest";
import { runPendingGoogleAdsJobs } from "./google-ads-ingest";
import { normalizeShopifyDomain, testShopifyConnection } from "./shopify-api";
import { normalizeWooSiteUrl, testWooConnection } from "./woo-api";

const SOURCE_LABELS: Record<BackfillSourceKey, string> = {
  google: "Google",
  meta: "Meta",
  ga4: "GA4",
  store: "Store",
};

export interface CreateClientState {
  ok: boolean;
  error?: string;
  clientId?: string;
}

/**
 * Creates a client from the wizard's final review step. All prior steps are
 * serialized into hidden form fields rather than server-side session state,
 * since this in-memory demo store has no per-user session concept yet.
 */
export async function createClientAction(
  _prev: CreateClientState,
  formData: FormData,
): Promise<CreateClientState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Client name is required." };

  const timezone = String(formData.get("timezone") ?? "UTC");
  const currency = String(formData.get("currency") ?? "USD");
  const googleCustomerId = String(formData.get("googleCustomerId") ?? "") || null;
  const metaAccountId = String(formData.get("metaAccountId") ?? "") || null;
  const ga4PropertyId = String(formData.get("ga4PropertyId") ?? "") || null;
  const storeType = String(formData.get("storeType") ?? "");

  let store: import("./admin-store").NewClientInput["store"] = null;
  if (storeType === "shopify") {
    const domainRaw = String(formData.get("shopifyDomain") ?? "").trim();
    const accessToken = String(formData.get("shopifyAccessToken") ?? "").trim();
    const includedStatuses = formData.getAll("shopifyStatuses").map(String);
    if (domainRaw) {
      if (!accessToken) {
        return { ok: false, error: "Shopify admin API access token is required to connect the store." };
      }
      const domain = normalizeShopifyDomain(domainRaw);
      try {
        await testShopifyConnection({ domain, accessToken });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Could not connect to Shopify: ${message}` };
      }
      store = { type: "shopify", domain, accessToken, includedStatuses };
    }
  } else if (storeType === "woocommerce") {
    const domain = String(formData.get("wooDomain") ?? "").trim();
    const consumerKey = String(formData.get("wooKey") ?? "").trim();
    const consumerSecret = String(formData.get("wooSecret") ?? "").trim();
    const includedStatuses = formData.getAll("wooStatuses").map(String);
    if (domain) {
      if (!consumerKey || !consumerSecret) {
        return { ok: false, error: "WooCommerce consumer key and secret are required to connect the store." };
      }
      const siteUrl = normalizeWooSiteUrl(domain);
      try {
        await testWooConnection({ siteUrl, consumerKey, consumerSecret });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Could not connect to WooCommerce: ${message}` };
      }
      store = { type: "woocommerce", domain: siteUrl, consumerKey, consumerSecret, includedStatuses };
    }
  }

  const record = await createClientRecord({
    name,
    timezone,
    currency,
    googleCustomerId,
    metaAccountId,
    ga4PropertyId,
    store,
  });

  return { ok: true, clientId: record.id };
}

export interface InviteUserState {
  ok: boolean;
  error?: string;
}

export async function inviteUserAction(_prev: InviteUserState, formData: FormData): Promise<InviteUserState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "client") as Role;
  const clientId = String(formData.get("clientId") ?? "") || null;
  const password = String(formData.get("password") ?? "");

  if (!name || !email) return { ok: false, error: "Name and email are required." };
  if (role === "client" && !clientId) return { ok: false, error: "Select which client this user should see." };
  if (password.length < 8) return { ok: false, error: "Temporary password must be at least 8 characters." };
  if (await findUserByEmail(email)) return { ok: false, error: "A user with that email already exists." };

  const passwordHash = await hashPassword(password);
  await createUserRecord({ name, email, role, clientId: role === "client" ? clientId : null, passwordHash });
  return { ok: true };
}

export interface ChangePasswordState {
  ok: boolean;
  error?: string;
}

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (!(await getUser(userId))) return { ok: false, error: "User not found." };

  await setUserPassword(userId, await hashPassword(password));
  return { ok: true };
}

export async function assignUserClientAction(userId: string, clientId: string): Promise<void> {
  await assignUserClient(userId, clientId || null);
}

export async function removeUserAction(userId: string): Promise<void> {
  await removeUserRecord(userId);
}

export interface BackfillState {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Queues the requested date range for every selected source and immediately
 * fires the real processors (same fire-and-forget pattern as the individual
 * "Run X now" buttons) -- unconditionally, every time. Does not check
 * whether that source has other work already in flight before deciding
 * whether to act: an earlier version did, and that meant a brand-new
 * single-day request silently did nothing whenever a bigger historical
 * backfill for the same source hadn't finished yet (the date was never
 * even queued, since the code assumed "already queued" from the unrelated
 * older range meant there was nothing new to do). startBackfillRecord's
 * upsert is scoped per-day, so requesting overlapping or brand-new dates
 * while other days are mid-flight is always safe.
 */
export async function startBackfillAction(_prev: BackfillState, formData: FormData): Promise<BackfillState> {
  const clientId = String(formData.get("clientId") ?? "");
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  const sources = formData.getAll("sources").map(String) as BackfillSourceKey[];

  if (!start || !end) return { ok: false, error: "Pick a start and end date." };
  if (start > end) return { ok: false, error: "Start date must be before the end date." };
  if (sources.length === 0) return { ok: false, error: "Select at least one source to backfill." };

  const { requested, storeType } = await startBackfillRecord(clientId, sources, { start, end });

  for (const key of requested) {
    if (key === "ga4") {
      void runPendingGa4Jobs(clientId).catch((err) => console.error("GA4 job run failed for client", clientId, err));
    } else if (key === "meta") {
      void runPendingMetaJobs(clientId).catch((err) => console.error("Meta job run failed for client", clientId, err));
    } else if (key === "google") {
      void runPendingGoogleAdsJobs(clientId).catch((err) => console.error("Google Ads job run failed for client", clientId, err));
    } else if (key === "store" && storeType === "woocommerce") {
      void runPendingWooJobs(clientId).catch((err) => console.error("WooCommerce job run failed for client", clientId, err));
    } else if (key === "store" && storeType === "shopify") {
      void runPendingShopifyJobs(clientId).catch((err) => console.error("Shopify job run failed for client", clientId, err));
    }
    // "store" when storeType is null (no store connected yet): rows stay queued only.
  }

  return { ok: true, message: `Queued and started: ${requested.map((s) => SOURCE_LABELS[s]).join(", ")}.` };
}

export async function archiveClientAction(clientId: string): Promise<void> {
  await archiveClient(clientId);
}

export async function unarchiveClientAction(clientId: string): Promise<void> {
  await unarchiveClient(clientId);
}

export async function updateClientBudgetAction(clientId: string, amount: number | null): Promise<void> {
  await updateClientBudget(clientId, amount);
}

export async function deleteClientAction(clientId: string): Promise<void> {
  await deleteClient(clientId);
  redirect("/admin/clients");
}

export async function connectClientAccountAction(clientId: string, platform: ConnectablePlatform, externalId: string): Promise<void> {
  await connectClientAccount(clientId, platform, externalId);
}

/**
 * Fire-and-forget: does not await the job loop, since a multi-day backfill
 * would otherwise hold the request open for minutes. Safe on Railway's
 * persistent Node process (unlike a serverless function, nothing kills
 * in-flight work once the response is sent); the .catch keeps a failure
 * from becoming an unhandled rejection that could crash the whole server.
 */
export async function runGa4NowAction(clientId: string): Promise<{ ok: true }> {
  void runPendingGa4Jobs(clientId).catch((err) => {
    console.error("GA4 job run failed for client", clientId, err);
  });
  return { ok: true };
}

/** Same fire-and-forget shape as runGa4NowAction. */
export async function runGoogleAdsNowAction(clientId: string): Promise<{ ok: true }> {
  void runPendingGoogleAdsJobs(clientId).catch((err) => {
    console.error("Google Ads job run failed for client", clientId, err);
  });
  return { ok: true };
}

/** Same fire-and-forget shape as runGa4NowAction. */
export async function runMetaNowAction(clientId: string): Promise<{ ok: true }> {
  void runPendingMetaJobs(clientId).catch((err) => {
    console.error("Meta job run failed for client", clientId, err);
  });
  return { ok: true };
}

/** Same fire-and-forget shape as runGa4NowAction. */
export async function runWooNowAction(clientId: string): Promise<{ ok: true }> {
  void runPendingWooJobs(clientId).catch((err) => {
    console.error("WooCommerce job run failed for client", clientId, err);
  });
  return { ok: true };
}

/** Same fire-and-forget shape as runGa4NowAction. */
export async function runShopifyNowAction(clientId: string): Promise<{ ok: true }> {
  void runPendingShopifyJobs(clientId).catch((err) => {
    console.error("Shopify job run failed for client", clientId, err);
  });
  return { ok: true };
}

export interface SaveWooState {
  ok: boolean;
  error?: string;
}

/**
 * Tests the given WooCommerce credentials against the live store before
 * saving, so a typo'd URL or key never gets silently persisted as a
 * "connected" store that then fails on every backfill. Always overwrites
 * both key and secret, since WooCommerce never lets us read a saved secret
 * back to prefill the edit form.
 */
export async function saveWooConnectionAction(_prev: SaveWooState, formData: FormData): Promise<SaveWooState> {
  const clientId = String(formData.get("clientId") ?? "");
  const siteUrlRaw = String(formData.get("siteUrl") ?? "").trim();
  const consumerKey = String(formData.get("consumerKey") ?? "").trim();
  const consumerSecret = String(formData.get("consumerSecret") ?? "").trim();
  const includedStatuses = formData.getAll("includedStatuses").map(String);

  if (!clientId) return { ok: false, error: "Missing client." };
  if (!siteUrlRaw) return { ok: false, error: "Site URL is required." };
  if (!consumerKey || !consumerSecret) return { ok: false, error: "Consumer key and secret are required." };
  if (includedStatuses.length === 0) return { ok: false, error: "Select at least one order status to count toward revenue." };

  const siteUrl = normalizeWooSiteUrl(siteUrlRaw);
  try {
    await testWooConnection({ siteUrl, consumerKey, consumerSecret });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not connect to WooCommerce: ${message}` };
  }

  await saveWooConnection(clientId, { siteUrl, consumerKey, consumerSecret, includedStatuses });
  return { ok: true };
}

export interface SaveShopifyState {
  ok: boolean;
  error?: string;
}

/**
 * Tests the given Shopify custom-app access token against the live store
 * before saving, same reasoning as saveWooConnectionAction. Always
 * overwrites the token, since Shopify never lets us read a saved token back
 * to prefill the edit form.
 */
export async function saveShopifyConnectionAction(_prev: SaveShopifyState, formData: FormData): Promise<SaveShopifyState> {
  const clientId = String(formData.get("clientId") ?? "");
  const domainRaw = String(formData.get("domain") ?? "").trim();
  const accessToken = String(formData.get("accessToken") ?? "").trim();
  const includedStatuses = formData.getAll("includedStatuses").map(String);

  if (!clientId) return { ok: false, error: "Missing client." };
  if (!domainRaw) return { ok: false, error: "Shop domain is required." };
  if (!accessToken) return { ok: false, error: "Admin API access token is required." };
  if (includedStatuses.length === 0) return { ok: false, error: "Select at least one order status to count toward revenue." };

  const domain = normalizeShopifyDomain(domainRaw);
  try {
    await testShopifyConnection({ domain, accessToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not connect to Shopify: ${message}` };
  }

  await saveShopifyConnection(clientId, { domain, accessToken, includedStatuses });
  return { ok: true };
}

export async function redirectToClient(clientId: string): Promise<void> {
  redirect(`/admin/clients/${clientId}`);
}

// ---------------------------------------------------------------------------
// Login / logout
// ---------------------------------------------------------------------------
export interface LoginState {
  ok: boolean;
  error?: string;
}

async function performLogin(formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: "Invalid email or password." };
  }

  const token = await signSession({ userId: user.id, name: user.name, role: user.role, clientId: user.clientId });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  const safeNext = next.startsWith("/") && !next.startsWith("/login") ? next : null;
  redirect(safeNext ?? (user.role === "client" ? "/" : "/admin"));
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  return performLogin(formData);
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
