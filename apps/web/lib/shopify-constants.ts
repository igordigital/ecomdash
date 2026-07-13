/**
 * Shared with both server code (admin-store.ts) and client components
 * (new-client-wizard.tsx, row-actions.tsx). Kept in its own file with no
 * server-only imports so client components can pull in the value without
 * dragging lib/db.ts's `pg` dependency into the browser bundle.
 */
export const SHOPIFY_STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "partially_refunded", label: "Partially refunded" },
  { value: "refunded", label: "Refunded" },
  { value: "pending", label: "Pending" },
  { value: "authorized", label: "Authorized" },
];
