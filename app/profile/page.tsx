import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth";
import { formatCredits } from "../../lib/money";
import SetPasswordForm from "../../components/SetPasswordForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <div className="space-y-4">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-zinc-400">Username:</span>{" "}
              <span className="font-medium text-zinc-50">{user.username}</span>
            </div>
            <div>
              <span className="text-zinc-400">Balance:</span>{" "}
              <span className="font-medium text-zinc-50">
                {formatCredits(user.balanceCents)}
              </span>
            </div>
            {user.isAdmin ? (
              <div>
                <span className="text-zinc-400">Role:</span>{" "}
                <span className="font-medium text-zinc-50">Admin</span>
              </div>
            ) : null}
          </div>
        </div>
        <SetPasswordForm />
      </div>
    </div>
  );
}
