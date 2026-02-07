import LoginForm from "../../components/LoginForm";
import { getCurrentUser } from "../../lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/markets");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
        <p className="text-sm text-zinc-300">
          Sign in with your username and password.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
