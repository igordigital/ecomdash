import { LoginForm } from "@/components/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <p className="mb-1 text-sm font-bold text-slate-100">The Lean Commerce Data Room (beta)</p>
        <h1 className="text-lg font-semibold text-slate-100">Sign in</h1>
        <p className="mt-1 mb-5 text-sm text-slate-400">
          E-commerce control dashboard. Access is scoped by role: Admin, Analyst, or Client.
        </p>
        <LoginForm next={next ?? "/"} />
      </div>
    </div>
  );
}
