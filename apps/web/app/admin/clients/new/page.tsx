import { NewClientWizard } from "@/components/admin/new-client-wizard";
import { AdminPageHeader } from "@/components/admin/ui";
import { getAssignedAccountIds, getGa4Properties, getGoogleAccounts, getMetaAccounts } from "@/lib/admin-store";

export default function NewClientPage() {
  const assigned = getAssignedAccountIds();

  return (
    <>
      <AdminPageHeader
        title="New client"
        description="Name the client, then attach the platforms it runs on. Google, Meta, and GA4 are already authorized agency-wide: pick the account, don't reconnect it."
      />
      <NewClientWizard
        googleAccounts={getGoogleAccounts()}
        metaAccounts={getMetaAccounts()}
        ga4Properties={getGa4Properties()}
        assignedGoogleIds={[...assigned.google]}
        assignedMetaIds={[...assigned.meta]}
        assignedGa4Ids={[...assigned.ga4]}
      />
    </>
  );
}
