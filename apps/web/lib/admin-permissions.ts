import type { Role } from "./admin-store";

/**
 * Role capability table for the admin panel. Admin owns agency-level
 * platform connections and staff accounts; Analyst runs day-to-day
 * onboarding and dashboard assignment (including resetting a client's
 * password) but not staff accounts or platform connections; Client never
 * reaches /admin at all (enforced in middleware.ts).
 */
export type StaffRole = "admin" | "analyst";

export function canManageIntegrations(role: StaffRole): boolean {
  return role === "admin";
}

export function canManageStaff(role: StaffRole): boolean {
  // Invite/edit/remove admin and analyst accounts, and reset their passwords.
  return role === "admin";
}

export function canCreateClient(_role: StaffRole): boolean {
  return true; // admin and analyst can both onboard clients
}

export function canAssignClientDashboard(_role: StaffRole): boolean {
  return true; // admin and analyst can both assign a client user to a dashboard
}

export function canResetPassword(actorRole: StaffRole, targetRole: Role): boolean {
  return actorRole === "admin" || targetRole === "client";
}
