import { quickLoginAction } from "@/lib/admin-actions";
import { getClient, getUsers } from "@/lib/admin-store";
import { LoginForm } from "@/components/login-form";

const DEMO_PASSWORD = "ecomdash-demo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const users = getUsers();

  return (
    <div className="grid w-full max-w-3xl gap-8 md:grid-cols-2">
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <p className="mb-1 text-sm font-bold text-slate-100">ecomdash</p>
        <h1 className="text-lg font-semibold text-slate-100">Sign in</h1>
        <p className="mt-1 mb-5 text-sm text-slate-400">
          E-commerce control dashboard. Access is scoped by role: Admin, Analyst, or Client.
        </p>
        <LoginForm next={next ?? "/"} />
      </div>

      <div className="rounded-lg border border-dashed border-amber-900/60 bg-amber-950/20 p-6">
        <p className="text-sm font-semibold text-amber-300">Demo accounts</p>
        <p className="mt-1 text-xs text-amber-400/80">
          Password for every seed account is <code className="rounded bg-black/30 px-1 py-0.5">{DEMO_PASSWORD}</code>.
          One-click sign-in below skips typing it.
        </p>
        <ul className="mt-4 grid gap-2">
          {users.map((u) => {
            const client = u.clientId ? getClient(u.clientId) : undefined;
            return (
              <li key={u.id}>
                <form action={quickLoginAction} className="flex items-center justify-between gap-3 rounded border border-slate-800 px-3 py-2">
                  <input type="hidden" name="email" value={u.email} />
                  <input type="hidden" name="password" value={DEMO_PASSWORD} />
                  <input type="hidden" name="next" value={next ?? ""} />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-200">{u.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {u.role[0]!.toUpperCase() + u.role.slice(1)}
                      {client ? ` · ${client.name}` : ""}
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="shrink-0 rounded border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-600"
                  >
                    Sign in
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
