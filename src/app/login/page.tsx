import { getSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const hasPassword = !!getSetting("kite_password");

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[var(--bg)] z-50">
      <div className="panel !rounded-3xl p-10 w-full max-w-sm text-center space-y-5">
        <div>
          <div className="text-5xl">🪁</div>
          <h1 className="text-2xl font-extrabold mt-2">kite</h1>
          <p className="hint mt-1">
            {hasPassword
              ? "Welcome back — enter your password."
              : "First flight: create a password to protect your Kite (it's visible on your network)."}
          </p>
        </div>
        <form method="POST" action="/api/auth" className="space-y-3">
          <input
            name="password"
            type="password"
            className="input !py-3 text-center"
            placeholder={hasPassword ? "Password" : "Create a password (min 8 chars)"}
            autoFocus
            required
          />
          {error === "wrong" && <p className="hint !text-[var(--red)]">Wrong password — try again.</p>}
          {error === "short" && <p className="hint !text-[var(--red)]">Use at least 8 characters.</p>}
          <button className="btn btn-dark btn-lg w-full">
            {hasPassword ? "Unlock" : "Set password & enter"}
          </button>
        </form>
        <p className="hint">Stored as a salted password hash. Keep your deployment secrets private.</p>
      </div>
    </div>
  );
}
