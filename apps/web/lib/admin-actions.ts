"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  assignUserClient,
  createClientRecord,
  createUserRecord,
  removeUser as removeUserRecord,
  startBackfill as startBackfillRecord,
  type Role,
} from "./admin-store";

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
    const domain = String(formData.get("shopifyDomain") ?? "").trim();
    if (domain) store = { type: "shopify", domain };
  } else if (storeType === "woocommerce") {
    const domain = String(formData.get("wooDomain") ?? "").trim();
    const includedStatuses = formData.getAll("wooStatuses").map(String);
    if (domain) store = { type: "woocommerce", domain, includedStatuses };
  }

  const record = createClientRecord({
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

  if (!name || !email) return { ok: false, error: "Name and email are required." };
  if (role === "client" && !clientId) return { ok: false, error: "Select which client this user should see." };

  createUserRecord({ name, email, role, clientId: role === "client" ? clientId : null });
  return { ok: true };
}

export async function assignUserClientAction(userId: string, clientId: string): Promise<void> {
  assignUserClient(userId, clientId || null);
}

export async function removeUserAction(userId: string): Promise<void> {
  removeUserRecord(userId);
}

export async function startBackfillAction(clientId: string): Promise<void> {
  startBackfillRecord(clientId);
}

const DEMO_ROLE_COOKIE = "demo_role";

export async function setDemoRoleAction(role: "admin" | "analyst"): Promise<void> {
  const store = await cookies();
  store.set(DEMO_ROLE_COOKIE, role, { path: "/admin" });
}

export async function getDemoRole(): Promise<"admin" | "analyst"> {
  const store = await cookies();
  const value = store.get(DEMO_ROLE_COOKIE)?.value;
  return value === "analyst" ? "analyst" : "admin";
}

export async function redirectToClient(clientId: string): Promise<void> {
  redirect(`/admin/clients/${clientId}`);
}
