import { getSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const hasAccount =
    Boolean(getSetting("kite_email")) &&
    Boolean(getSetting("kite_password"));

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[var(--bg)] z-50 px-5">
      <div className="panel !rounded-3xl p-10 w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="text-5xl">🪁</div>
          <h1 className="text-3xl font-extrabold mt-2">Kite</h1>
          <p className="hint mt-2">
            {hasAccount
              ? "Sign in to continue your job search."
              : "Create your private Kite owner account."}
          </p>
        </div>

        <form method="POST" action="/api/auth" className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2">
              Email address
            </label>
            <input
              name="email"
              type="email"
              className="input !py-3 w-full"
              placeholder="you@example.com"
              autoComplete="email"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              Password
            </label>
            <input
              name="password"
              type="password"
              className="input !py-3 w-full"
              placeholder={
                hasAccount
                  ? "Enter your password"
                  : "Create a password"
              }
              autoComplete={hasAccount ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </div>

          {error === "wrong" && (
            <p className="hint !text-[var(--red)]">
              Incorrect email or password.
            </p>
          )}

          {error === "email" && (
            <p className="hint !text-[var(--red)]">
              Enter a valid email address.
            </p>
          )}

          {error === "short" && (
            <p className="hint !text-[var(--red)]">
              Password must contain at least 6 characters.
            </p>
          )}

          <button className="btn btn-dark btn-lg w-full">
            {hasAccount ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="hint text-center">
          Your password is stored as a salted cryptographic hash.
        </p>
      </div>
    </div>
  );
}
