import { type FormEvent, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import logo from "../assets/logo.png";

export default function LoginPage() {
  const { signInWithPassword, session, isDemoMode } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session || isDemoMode) navigate("/dashboard", { replace: true });
  }, [session, isDemoMode, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signInWithPassword(email, password);
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      navigate("/dashboard", { replace: true });
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-nn-pale-sky to-nn-mist px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="Materna logo" className="h-10 w-auto" />
            <span className="text-xl font-bold tracking-tight text-nn-navy">
              Materna
            </span>
          </Link>
          <p className="text-sm text-nn-navy-light">
            Sign in to your wellness account
          </p>
        </div>

        {/* Card */}
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-nn-navy"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-3 text-sm text-nn-navy placeholder-nn-navy-light outline-none transition focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-nn-navy"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-3 text-sm text-nn-navy outline-none transition focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 border border-red-100">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-nn-deep-blue px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-nn-deep-blue-hover disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-nn-navy-light">
            Don&apos;t have an account?{" "}
            <Link
              to="/signup"
              className="font-medium text-nn-deep-blue hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
