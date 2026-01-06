"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function logout() {
    setIsSubmitting(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={isSubmitting}
      className="rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-900 disabled:opacity-50"
    >
      Logout
    </button>
  );
}

