import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/ui";
import { Badge, Card } from "@/components/ui";
import { getAgencyIntegrations, getGa4Properties, getGoogleAccounts, getMetaAccounts } from "@/lib/admin-store";

const GA4_ERROR_LABELS: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  invalid_state: "That link expired. Try connecting again.",
  no_refresh_token: "Google didn't return a long-lived token. Try again; consent should prompt fresh.",
  exchange_failed: "Something went wrong talking to Google. Check the server logs.",
};

const GOOGLE_ADS_ERROR_LABELS: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  invalid_state: "That link expired. Try connecting again.",
  no_refresh_token: "Google didn't return a long-lived token. Try again; consent should prompt fresh.",
};

const META_ERROR_LABELS: Record<string, string> = {
  access_denied: "Meta sign-in was cancelled.",
  invalid_state: "That link expired. Try connecting again.",
  exchange_failed: "Something went wrong talking to Meta. Check the server logs.",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ga4?: string; ga4_message?: string; meta?: string; meta_message?: string; google?: string; google_message?: string }>;
}) {
  const sp = await searchParams;
  const [integrations, googleAccounts, metaAccounts, ga4Properties] = await Promise.all([
    getAgencyIntegrations(),
    getGoogleAccounts(),
    getMetaAccounts(),
    getGa4Properties(),
  ]);
  const { google, meta, ga4 } = integrations;
  const metaDaysLeft = meta.expiresAt ? Math.ceil((new Date(meta.expiresAt).getTime() - Date.now()) / MS_PER_DAY) : null;
  const metaExpiringSoon = metaDaysLeft !== null && metaDaysLeft <= 14;
  const mccId = process.env.GOOGLE_ADS_MCC_ID ?? "";
  const developerTokenConfigured = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);

  return (
    <>
      <AdminPageHeader
        title="Integrations"
        description="Authorize each platform once, at the agency level. New clients then pick from the accounts and properties already visible here, instead of going through OAuth per client."
      />

      {sp.google === "connected" ? (
        <div className="mb-4 rounded border border-emerald-900/60 bg-emerald-950/20 p-3 text-xs text-emerald-300">
          Google Ads connected. Accounts below are refreshed from your MCC.
        </div>
      ) : sp.google === "error" ? (
        <div className="mb-4 rounded border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-300">
          Couldn&apos;t connect Google Ads: {GOOGLE_ADS_ERROR_LABELS[sp.google_message ?? ""] ?? sp.google_message ?? "unknown error"}
        </div>
      ) : null}

      {sp.ga4 === "connected" ? (
        <div className="mb-4 rounded border border-emerald-900/60 bg-emerald-950/20 p-3 text-xs text-emerald-300">
          Google Analytics connected. Properties below are refreshed from that account.
        </div>
      ) : sp.ga4 === "error" ? (
        <div className="mb-4 rounded border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-300">
          Couldn&apos;t connect Google Analytics: {GA4_ERROR_LABELS[sp.ga4_message ?? ""] ?? sp.ga4_message ?? "unknown error"}
        </div>
      ) : null}

      {sp.meta === "connected" ? (
        <div className="mb-4 rounded border border-emerald-900/60 bg-emerald-950/20 p-3 text-xs text-emerald-300">
          Meta connected. Ad accounts below are refreshed from that account.
        </div>
      ) : sp.meta === "error" ? (
        <div className="mb-4 rounded border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-300">
          Couldn&apos;t connect Meta: {META_ERROR_LABELS[sp.meta_message ?? ""] ?? sp.meta_message ?? "unknown error"}
        </div>
      ) : null}

      {metaExpiringSoon ? (
        <div className="mb-4 rounded border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-300">
          Meta&apos;s connection expires in {metaDaysLeft} day{metaDaysLeft === 1 ? "" : "s"} — Meta tokens don&apos;t
          renew silently. Reconnect below before it lapses.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Google Ads</h2>
            <Badge tone={google.connected ? "good" : "bad"}>{google.connected ? "Connected" : "Not connected"}</Badge>
          </div>
          <dl className="mt-3 grid gap-1.5 text-xs text-slate-400">
            <div className="flex justify-between">
              <dt>MCC</dt>
              <dd className="tabular-nums text-slate-300">{mccId || "not set"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Developer token</dt>
              <dd>
                <Badge tone={developerTokenConfigured ? "good" : "warn"}>{developerTokenConfigured ? "Configured" : "Missing"}</Badge>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Connected as</dt>
              <dd className="max-w-[160px] truncate text-slate-300" title={google.connectedEmail}>
                {google.connectedEmail || "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Connected</dt>
              <dd className="text-slate-300">{google.connectedAt}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-slate-600">
            OAuth sign-in under the agency MCC, plus a static developer token (Railway env var, applied for once via
            the MCC&apos;s API Center — Basic access takes Google days to weeks to approve before any client pull
            works).
          </p>
          <Link
            href="/api/admin/integrations/google-ads/authorize"
            className="mt-3 block w-full rounded border border-slate-700 py-1.5 text-center text-xs font-medium text-slate-300 hover:border-slate-600"
          >
            {google.connected ? "Reconnect" : "Connect Google Ads"}
          </Link>
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
              <dt>Connected as</dt>
              <dd className="max-w-[160px] truncate text-slate-300" title={meta.connectedName}>
                {meta.connectedName || "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Connected</dt>
              <dd className="text-slate-300">{meta.connectedAt}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Expires</dt>
              <dd className={metaExpiringSoon ? "text-amber-400" : "text-slate-300"}>
                {meta.expiresAt ? new Date(meta.expiresAt).toISOString().slice(0, 10) : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-slate-600">
            OAuth sign-in through a dedicated Meta app, scoped to ads_read. Expires roughly every 60 days with no
            silent renewal; reconnect manually before it lapses.
          </p>
          <Link
            href="/api/admin/integrations/meta/authorize"
            className="mt-3 block w-full rounded border border-slate-700 py-1.5 text-center text-xs font-medium text-slate-300 hover:border-slate-600"
          >
            {meta.connected ? "Reconnect" : "Connect Meta"}
          </Link>
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
              <dt>Connected as</dt>
              <dd className="max-w-[160px] truncate text-slate-300" title={ga4.connectedEmail}>
                {ga4.connectedEmail || "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Connected</dt>
              <dd className="text-slate-300">{ga4.connectedAt}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-slate-600">
            OAuth sign-in, agency level. Lists whichever GA4 properties this Google account already has Viewer access
            to; grant that access in each client&apos;s GA4 property first if a property is missing below.
          </p>
          <Link
            href="/api/admin/integrations/ga4/authorize"
            className="mt-3 block w-full rounded border border-slate-700 py-1.5 text-center text-xs font-medium text-slate-300 hover:border-slate-600"
          >
            {ga4.connected ? "Reconnect" : "Connect Google Analytics"}
          </Link>
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
