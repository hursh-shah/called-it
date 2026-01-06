import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Council Market</h1>
      <p className="text-zinc-300">
        A small, credits-only prediction market for your friend group.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Login
        </Link>
        <Link
          href="/markets"
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-900"
        >
          View markets
        </Link>
      </div>
    </div>
  );
}

