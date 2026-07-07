import { AdminPageHeader } from "@/components/admin/ui";
import { Badge, Card } from "@/components/ui";
import { getAgencyIntegrations, getGa4Properties, getGoogleAccounts, getMetaAccounts } from "@/lib/admin-store";

export default async function IntegrationsPage() {
  const [integrations, googleAccounts, metaAccounts, ga4Properties] = await Promise.all([
    getAgencyIntegrations(),
    getGoogleAccounts(),
    getMetaAccounts(),
    getGa4Properties(),
  ]);
  const { google, meta, ga4 } = integrations;

  return (
    <>
      <AdminPageHeader
        title="Integrations"
        description="Authorize each platform once, at the agency level. New clients then pick from the accounts and properties already visible here, instead of going through OAuth per client."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Google Ads</h2>
            <Badge tone={google.connected ? "good" : "bad"}>{google.connected ? "Connected" : "Not connected"}</Badge>
          </div>
          <dl className="mt-3 grid gap-1.5 text-xs text-slate-400">
            <div className="flex justify-between">
              <dt>MCC</dt>
              <dd className="tabular-nums text-slate-300">{google.mccId}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Developer token</dt>
              <dd>
                <Badge tone={google.developerTokenStatus === "approved" ? "good" : "warn"}>
                  {google.developerTokenStatus === "approved" ? "Approved" : "Pending"}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Connected</dt>
              <dd className="text-slate-300">{google.connectedAt}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-slate-600">
            OAuth2 refresh token under the agency MCC. Real-world caveat: Basic API access is applied for once and
            takes days to weeks for Google to approve before any client pull works.
          </p>
          <button className="mt-3 w-full rounded border border-slate-700 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600">
            Reauthorize
          </button>
          <div className="mt-4 border-t border-slate-800 pt-3">
            <p className="mb-1.5 text-xs font-medium text-slate-500">Visible accounts ({googleAccounts.length})</p>
            <ul className="grid gap-1 text-xs text-slate-400">
              {googleAccounts.map((a) => (
                <li key={a.customerId} className="flex justify-between">
                  <span>{a.name}</span>
                  <span className="tabular-nums text-slate-500">{a.customerId}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Meta</h2>
            <Badge tone={meta.connected ? "good" : "bad"}>{meta.connected ? "Connected" : "Not connected"}</Badge>
          </div>
          <dl className="mt-3 grid gap-1.5 text-xs text-slate-400">
            <div className="flex justify-between">
              <dt>Business Manager</dt>
              <dd className="text-slate-300">{meta.businessManagerName}</dd>
            </div>
            <div className="flex justify-between">
              <dt>BM ID</dt>
              <dd className="tabular-nums text-slate-300">{meta.businessManagerId}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Connected</dt>
              <dd className="text-slate-300">{meta.connectedAt}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-slate-600">
            Long-lived system user token, server-to-server, scoped to ads_read. Client ad accounts must be shared to
            this Business Manager before they appear below.
          </p>
          <button className="mt-3 w-full rounded border border-slate-700 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600">
            Reauthorize
          </button>
          <div className="mt-4 border-t border-slate-800 pt-3">
            <p className="mb-1.5 text-xs font-medium text-slate-500">Visible ad accounts ({metaAccounts.length})</p>
            <ul className="grid gap-1 text-xs text-slate-400">
              {metaAccounts.map((a) => (
                <li key={a.accountId} className="flex justify-between">
                  <span>{a.name}</span>
                  <span className="tabular-nums text-slate-500">{a.accountId}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">GA4</h2>
            <Badge tone={ga4.connected ? "good" : "bad"}>{ga4.connected ? "Connected" : "Not connected"}</Badge>
          </div>
          <dl className="mt-3 grid gap-1.5 text-xs text-slate-400">
            <div className="flex justify-between">
              <dt>Service account</dt>
              <dd className="max-w-[160px] truncate text-slate-300" title={ga4.serviceAccountEmail}>
                {ga4.serviceAccountEmail}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Connected</dt>
              <dd className="text-slate-300">{ga4.connectedAt}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-slate-600">
            A single shared service account. Each client grants it Viewer access on their GA4 property; that grant is
            a per-client prerequisite, done once outside this app.
          </p>
          <button className="mt-3 w-full rounded border border-slate-700 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600">
            Rotate credential
          </button>
          <div className="mt-4 border-t border-slate-800 pt-3">
            <p className="mb-1.5 text-xs font-medium text-slate-500">Visible properties ({ga4Properties.length})</p>
            <ul className="grid gap-1 text-xs text-slate-400">
              {ga4Properties.map((p) => (
                <li key={p.propertyId} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-slate-500">{p.domain}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Shopify and WooCommerce">
          <p className="text-sm text-slate-400">
            These cannot be pre-authorized at the agency level: each store has its own owner and its own credentials.
            Connect them from each client&apos;s page instead.
          </p>
        </Card>
      </div>
    </>
  );
}
