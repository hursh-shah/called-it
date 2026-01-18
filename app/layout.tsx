import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentUser } from "../lib/auth";
import { formatCredits } from "../lib/money";
import LogoutButton from "../components/LogoutButton";

export const metadata: Metadata = {
  title: "Called It",
  description: "A small prediction market for your group chat."
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-50">
        <header className="border-b border-zinc-800">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Called It
            </Link>
            <nav className="flex items-center gap-4 text-sm text-zinc-300">
              <Link href="/markets" className="hover:text-zinc-50">
                Markets
              </Link>
              <Link href="/markets/archive" className="hover:text-zinc-50">
                Archive
              </Link>
              <Link href="/suggestions" className="hover:text-zinc-50">
                Suggestions
              </Link>
              {user?.isAdmin ? (
                <Link href="/admin" className="hover:text-zinc-50">
                  Admin
                </Link>
              ) : null}
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="hidden text-xs text-zinc-400 sm:inline">
                    {user.username} • {formatCredits(user.balanceCents)}
                  </span>
                  <LogoutButton />
                </div>
              ) : (
                <Link href="/login" className="hover:text-zinc-50">
                  Login
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
