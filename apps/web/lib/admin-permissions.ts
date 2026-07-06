/**
 * Role capability table for the admin panel. There is no real auth system
 * yet, so "role" here is a demo cookie (see setDemoRoleAction) rather than
 * a session claim, but the boundaries are the ones the real system should
 * enforce once auth lands: Admin owns agency-level platform connections and
 * staff accounts; Analyst runs day-to-day onboarding and dashboard
 * assignment; Client never reaches /admin at all.
 */
export type DemoRole = "admin" | "analyst";

export function canManageIntegrations(role: DemoRole): boolean {
  return role === "admin";
}

export function canManageStaff(role: DemoRole): boolean {
  // Invite/edit/remove admin and analyst accounts.
  return role === "admin";
}

export function canCreateClient(_role: DemoRole): boolean {
  return true; // admin and analyst can both onboard clients
}

export function canAssignClientDashboard(_role: DemoRole): boolean {
  return true; // admin and analyst can both assign a client user to a dashboard
}
