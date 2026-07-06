"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, signSession, SESSION_COOKIE, verifyPassword } from "./auth";
import {
  assignUserClient,
  createClientRecord,
  createUserRecord,
  findUserByEmail,
  getUser,
  removeUser as removeUserRecord,
  setUserPassword,
  startBackfill as startBackfillRecord,
  type BackfillSourceKey,
  type Role,
} from "./admin-store";

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
  const password = String(formData.get("password") ?? "");

  if (!name || !email) return { ok: false, error: "Name and email are required." };
  if (role === "client" && !clientId) return { ok: false, error: "Select which client this user should see." };
  if (password.length < 8) return { ok: false, error: "Temporary password must be at least 8 characters." };
  if (findUserByEmail(email)) return { ok: false, error: "A user with that email already exists." };

  const passwordHash = await hashPassword(password);
  createUserRecord({ name, email, role, clientId: role === "client" ? clientId : null, passwordHash });
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
  if (!getUser(userId)) return { ok: false, error: "User not found." };

  setUserPassword(userId, await hashPassword(password));
  return { ok: true };
}

export async function assignUserClientAction(userId: string, clientId: string): Promise<void> {
  assignUserClient(userId, clientId || null);
}

export async function removeUserAction(userId: string): Promise<void> {
  removeUserRecord(userId);
}

export interface BackfillState {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function startBackfillAction(_prev: BackfillState, formData: FormData): Promise<BackfillState> {
  const clientId = String(formData.get("clientId") ?? "");
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  const sources = formData.getAll("sources").map(String) as BackfillSourceKey[];

  if (!start || !end) return { ok: false, error: "Pick a start and end date." };
  if (start > end) return { ok: false, error: "Start date must be before the end date." };
  if (sources.length === 0) return { ok: false, error: "Select at least one source to backfill." };

  const { queued, blocked } = startBackfillRecord(clientId, sources, { start, end });
  if (queued.length === 0) {
    return { ok: false, error: "Every selected source already has a backfill in progress." };
  }
  if (blocked.length > 0) {
    return {
      ok: true,
      message: `Queued ${queued.map((s) => SOURCE_LABELS[s]).join(", ")}. Skipped ${blocked
        .map((s) => SOURCE_LABELS[s])
        .join(", ")} (already in progress).`,
    };
  }
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

  const user = findUserByEmail(email);
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

/** Same as loginAction but shaped for a plain <form action={...}>, used by the login page's one-click demo accounts. */
export async function quickLoginAction(formData: FormData): Promise<void> {
  await performLogin(formData);
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
