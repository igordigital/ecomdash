import { NewClientWizard } from "@/components/admin/new-client-wizard";
import { AdminPageHeader } from "@/components/admin/ui";
import { getAssignedAccountIds, getGa4Properties, getGoogleAccounts, getMetaAccounts } from "@/lib/admin-store";

export default async function NewClientPage() {
  const [assigned, googleAccounts, metaAccounts, ga4Properties] = await Promise.all([
    getAssignedAccountIds(),
    getGoogleAccounts(),
    getMetaAccounts(),
    getGa4Properties(),
  ]);

  return (
    <>
      <AdminPageHeader
        title="New client"
        description="Name the client, then attach the platforms it runs on. Google, Meta, and GA4 are already authorized agency-wide: pick the account, don't reconnect it."
      />
      <NewClientWizard
        googleAccounts={googleAccounts}
        metaAccounts={metaAccounts}
        ga4Properties={ga4Properties}
        assignedGoogleIds={[...assigned.google]}
        assignedMetaIds={[...assigned.meta]}
        assignedGa4Ids={[...assigned.ga4]}
      />
    </>
  );
}
