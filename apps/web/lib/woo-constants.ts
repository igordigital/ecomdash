/**
 * Shared with both server code (admin-store.ts) and client components
 * (new-client-wizard.tsx, row-actions.tsx). Kept in its own file with no
 * server-only imports so client components can pull in the value without
 * dragging lib/db.ts's `pg` dependency into the browser bundle.
 */
export const WOO_STATUS_OPTIONS = [
  { value: "completed", label: "Completed" },
  { value: "processing", label: "Processing" },
  { value: "on-hold", label: "On hold" },
  { value: "pending", label: "Pending payment" },
  { value: "refunded", label: "Refunded" },
];
