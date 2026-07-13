"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientAction, type CreateClientState } from "@/lib/admin-actions";
import type { Ga4Property, GoogleAdsAccount, MetaAdAccount } from "@/lib/admin-store";
import { SHOPIFY_STATUS_OPTIONS } from "@/lib/shopify-constants";
import { WOO_STATUS_OPTIONS } from "@/lib/woo-constants";
import { Badge } from "@/components/ui";

const STEPS = ["Client info", "Google Ads", "Meta Ads", "GA4", "Store", "Review"] as const;

interface WizardState {
  name: string;
  timezone: string;
  currency: string;
  googleCustomerId: string | null;
  metaAccountId: string | null;
  ga4PropertyId: string | null;
  storeType: "shopify" | "woocommerce" | null;
  shopifyDomain: string;
  shopifyAccessToken: string;
  shopifyStatuses: string[];
  wooDomain: string;
  wooKey: string;
  wooSecret: string;
  wooStatuses: string[];
}

const INITIAL: WizardState = {
  name: "",
  timezone: "America/New_York",
  currency: "USD",
  googleCustomerId: null,
  metaAccountId: null,
  ga4PropertyId: null,
  storeType: null,
  shopifyDomain: "",
  shopifyAccessToken: "",
  shopifyStatuses: ["paid"],
  wooDomain: "",
  wooKey: "",
  wooSecret: "",
  wooStatuses: ["completed", "processing"],
};

const initialActionState: CreateClientState = { ok: false };

export function NewClientWizard({
  googleAccounts,
  metaAccounts,
  ga4Properties,
  assignedGoogleIds,
  assignedMetaIds,
  assignedGa4Ids,
}: {
  googleAccounts: GoogleAdsAccount[];
  metaAccounts: MetaAdAccount[];
  ga4Properties: Ga4Property[];
  assignedGoogleIds: string[];
  assignedMetaIds: string[];
  assignedGa4Ids: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL);
  const [actionState, formAction, pending] = useActionState(createClientAction, initialActionState);

  const assignedGoogle = useMemo(() => new Set(assignedGoogleIds), [assignedGoogleIds]);
  const assignedMeta = useMemo(() => new Set(assignedMetaIds), [assignedMetaIds]);
  const assignedGa4 = useMemo(() => new Set(assignedGa4Ids), [assignedGa4Ids]);

  useEffect(() => {
    if (actionState.ok && actionState.clientId) {
      router.push(`/admin/clients/${actionState.clientId}`);
    }
  }, [actionState, router]);

  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));
  const canNext =
    step !== 0 ||
    (state.name.trim().length > 0);

  return (
    <div className="grid grid-cols-[180px_1fr] gap-8">
      <ol className="flex flex-col gap-1">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i >= step}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${
                i === step
                  ? "bg-slate-800 font-medium text-slate-100"
                  : i < step
                    ? "text-slate-300 hover:bg-slate-900"
                    : "cursor-default text-slate-600"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  i < step
                    ? "bg-emerald-600 text-white"
                    : i === step
                      ? "bg-sky-600 text-white"
                      : "bg-slate-800 text-slate-500"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        {step === 0 ? (
          <div className="grid max-w-md gap-4">
            <h2 className="text-sm font-semibold text-slate-200">Client info</h2>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-400">Client name</span>
              <input
                autoFocus
                value={state.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Acme Outdoors"
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="grid gap-1 text-sm">
                <span className="text-slate-400">Timezone</span>
                <select
                  value={state.timezone}
                  onChange={(e) => patch({ timezone: e.target.value })}
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                >
                  {[
                    "America/New_York",
                    "America/Chicago",
                    "America/Denver",
                    "America/Los_Angeles",
                    "America/Toronto",
                    "Asia/Jerusalem",
                    "UTC",
                  ].map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-400">Currency</span>
                <select
                  value={state.currency}
                  onChange={(e) => patch({ currency: e.target.value })}
                  className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                >
                  {["USD", "CAD", "EUR", "GBP", "ILS"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <PlatformStep
            title="Google Ads"
            hint="Pre-authorized via the agency MCC. Pick the customer account for this client, or skip and connect later."
            items={googleAccounts.map((a) => ({
              id: a.customerId,
              primary: a.name,
              secondary: `${a.customerId} · ${a.currency}`,
              disabled: assignedGoogle.has(a.customerId),
            }))}
            selected={state.googleCustomerId}
            onSelect={(id) => patch({ googleCustomerId: id })}
          />
        ) : null}

        {step === 2 ? (
          <PlatformStep
            title="Meta Ads"
            hint="Pre-authorized via the agency Business Manager system user. Pick the ad account for this client, or skip and connect later."
            items={metaAccounts.map((a) => ({
              id: a.accountId,
              primary: a.name,
              secondary: `${a.accountId} · ${a.currency}`,
              disabled: assignedMeta.has(a.accountId),
            }))}
            selected={state.metaAccountId}
            onSelect={(id) => patch({ metaAccountId: id })}
          />
        ) : null}

        {step === 3 ? (
          <PlatformStep
            title="GA4"
            hint="Pre-authorized via the shared service account (added as Viewer on each property). Pick the property for this client, or skip and connect later."
            items={ga4Properties.map((p) => ({
              id: p.propertyId,
              primary: p.name,
              secondary: p.domain,
              disabled: assignedGa4.has(p.propertyId),
            }))}
            selected={state.ga4PropertyId}
            onSelect={(id) => patch({ ga4PropertyId: id })}
          />
        ) : null}

        {step === 4 ? (
          <div className="grid max-w-md gap-4">
            <h2 className="text-sm font-semibold text-slate-200">Store</h2>
            <p className="text-xs text-slate-500">
              The store is the source of revenue truth and cannot be pre-authorized at the agency level: each client
              owns their own store credentials.
            </p>
            <div className="flex gap-2">
              {(["shopify", "woocommerce"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => patch({ storeType: t })}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                    state.storeType === t
                      ? "border-sky-600 bg-sky-950 text-sky-300"
                      : "border-slate-700 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {t === "shopify" ? "Shopify" : "WooCommerce"}
                </button>
              ))}
            </div>

            {state.storeType === "shopify" ? (
              <div className="grid gap-3 rounded border border-slate-800 p-3">
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-400">Shop domain</span>
                  <input
                    value={state.shopifyDomain}
                    onChange={(e) => patch({ shopifyDomain: e.target.value })}
                    placeholder="acme-outdoors.myshopify.com"
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-400">Admin API access token</span>
                  <input
                    value={state.shopifyAccessToken}
                    onChange={(e) => patch({ shopifyAccessToken: e.target.value })}
                    type="password"
                    placeholder="shpat_..."
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  />
                </label>
                <p className="text-[11px] text-slate-600">
                  Create a custom app in Shopify admin (Settings → Apps and sales channels → Develop apps), grant it
                  read_orders and read_products, then install it and copy the Admin API access token here.
                </p>
                <div>
                  <p className="mb-1.5 text-sm text-slate-400">Order statuses that count toward revenue</p>
                  <div className="flex flex-wrap gap-3">
                    {SHOPIFY_STATUS_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-1.5 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={state.shopifyStatuses.includes(opt.value)}
                          onChange={(e) =>
                            patch({
                              shopifyStatuses: e.target.checked
                                ? [...state.shopifyStatuses, opt.value]
                                : state.shopifyStatuses.filter((s) => s !== opt.value),
                            })
                          }
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {state.storeType === "woocommerce" ? (
              <div className="grid gap-3 rounded border border-slate-800 p-3">
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-400">Site URL</span>
                  <input
                    value={state.wooDomain}
                    onChange={(e) => patch({ wooDomain: e.target.value })}
                    placeholder="northwindcoffee.co"
                    className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-400">Consumer key</span>
                    <input
                      value={state.wooKey}
                      onChange={(e) => patch({ wooKey: e.target.value })}
                      placeholder="ck_..."
                      className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-slate-400">Consumer secret</span>
                    <input
                      value={state.wooSecret}
                      onChange={(e) => patch({ wooSecret: e.target.value })}
                      type="password"
                      placeholder="cs_..."
                      className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                  </label>
                </div>
                <div>
                  <p className="mb-1.5 text-sm text-slate-400">Order statuses that count toward revenue</p>
                  <div className="flex flex-wrap gap-3">
                    {WOO_STATUS_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-1.5 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={state.wooStatuses.includes(opt.value)}
                          onChange={(e) =>
                            patch({
                              wooStatuses: e.target.checked
                                ? [...state.wooStatuses, opt.value]
                                : state.wooStatuses.filter((s) => s !== opt.value),
                            })
                          }
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {!state.storeType ? (
              <button
                type="button"
                onClick={() => setStep(5)}
                className="w-fit text-xs text-slate-500 hover:text-slate-300 hover:underline"
              >
                Skip for now
              </button>
            ) : null}
          </div>
        ) : null}

        {step === 5 ? (
          <form action={formAction} className="grid max-w-lg gap-4">
            <h2 className="text-sm font-semibold text-slate-200">Review and create</h2>
            <ReviewRow label="Name" value={state.name || "—"} onEdit={() => setStep(0)} />
            <ReviewRow label="Timezone / currency" value={`${state.timezone} · ${state.currency}`} onEdit={() => setStep(0)} />
            <ReviewRow
              label="Google Ads"
              value={
                state.googleCustomerId
                  ? (googleAccounts.find((a) => a.customerId === state.googleCustomerId)?.name ?? "—")
                  : "Not connected"
              }
              onEdit={() => setStep(1)}
            />
            <ReviewRow
              label="Meta Ads"
              value={
                state.metaAccountId ? (metaAccounts.find((a) => a.accountId === state.metaAccountId)?.name ?? "—") : "Not connected"
              }
              onEdit={() => setStep(2)}
            />
            <ReviewRow
              label="GA4"
              value={
                state.ga4PropertyId ? (ga4Properties.find((p) => p.propertyId === state.ga4PropertyId)?.name ?? "—") : "Not connected"
              }
              onEdit={() => setStep(3)}
            />
            <ReviewRow
              label="Store"
              value={
                state.storeType === "shopify"
                  ? `Shopify · ${state.shopifyDomain || "—"}`
                  : state.storeType === "woocommerce"
                    ? `WooCommerce · ${state.wooDomain || "—"}`
                    : "Not connected"
              }
              onEdit={() => setStep(4)}
            />

            <input type="hidden" name="name" value={state.name} />
            <input type="hidden" name="timezone" value={state.timezone} />
            <input type="hidden" name="currency" value={state.currency} />
            <input type="hidden" name="googleCustomerId" value={state.googleCustomerId ?? ""} />
            <input type="hidden" name="metaAccountId" value={state.metaAccountId ?? ""} />
            <input type="hidden" name="ga4PropertyId" value={state.ga4PropertyId ?? ""} />
            <input type="hidden" name="storeType" value={state.storeType ?? ""} />
            <input type="hidden" name="shopifyDomain" value={state.shopifyDomain} />
            <input type="hidden" name="shopifyAccessToken" value={state.shopifyAccessToken} />
            {state.shopifyStatuses.map((s) => (
              <input key={s} type="hidden" name="shopifyStatuses" value={s} />
            ))}
            <input type="hidden" name="wooDomain" value={state.wooDomain} />
            <input type="hidden" name="wooKey" value={state.wooKey} />
            <input type="hidden" name="wooSecret" value={state.wooSecret} />
            {state.wooStatuses.map((s) => (
              <input key={s} type="hidden" name="wooStatuses" value={s} />
            ))}

            {actionState.error ? <p className="text-sm text-red-400">{actionState.error}</p> : null}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="rounded px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {pending ? "Creating…" : "Create client"}
              </button>
            </div>
          </form>
        ) : null}

        {step < 5 ? (
          <div className="mt-6 flex items-center gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="rounded px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 disabled:opacity-30"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setStep((s) => Math.min(5, s + 1))}
              className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlatformStep({
  title,
  hint,
  items,
  selected,
  onSelect,
}: {
  title: string;
  hint: string;
  items: { id: string; primary: string; secondary: string; disabled: boolean }[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="grid max-w-lg gap-3">
      <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      <p className="text-xs text-slate-500">{hint}</p>
      <div className="grid gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={() => onSelect(selected === item.id ? null : item.id)}
            className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
              item.disabled
                ? "cursor-not-allowed border-slate-800 opacity-40"
                : selected === item.id
                  ? "border-sky-600 bg-sky-950"
                  : "border-slate-800 hover:border-slate-600"
            }`}
          >
            <span>
              <span className="font-medium text-slate-200">{item.primary}</span>
              <span className="ml-2 text-xs text-slate-500">{item.secondary}</span>
            </span>
            {item.disabled ? (
              <Badge tone="neutral">Already linked</Badge>
            ) : selected === item.id ? (
              <Badge tone="good">Selected</Badge>
            ) : null}
          </button>
        ))}
      </div>
      {!selected ? <p className="text-xs text-slate-600">No account selected. You can connect this later from the client page.</p> : null}
    </div>
  );
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between rounded border border-slate-800 px-3 py-2 text-sm">
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-slate-200">{value}</p>
      </div>
      <button type="button" onClick={onEdit} className="text-xs text-sky-400 hover:underline">
        Edit
      </button>
    </div>
  );
}
