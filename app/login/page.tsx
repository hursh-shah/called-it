import LoginForm from "../../components/LoginForm";
import { getCurrentUser } from "../../lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/markets");

  const tokenParam = searchParams.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
        <p className="text-sm text-zinc-300">
          Use your invite link (or paste the invite token) to join.
        </p>
      </div>
      <LoginForm initialToken={token} />
    </div>
  );
}
