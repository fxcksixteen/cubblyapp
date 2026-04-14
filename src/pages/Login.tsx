import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const Login = () => {
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (session) return <Navigate to="/@me" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 font-body">
      <div className="w-full max-w-[420px] rounded-3xl bg-card p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
            Welcome back!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We're so excited to see you again!
          </p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary font-body"
              placeholder="bear@cubbly.app"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary font-body"
              placeholder="••••••••"
            />
            <button type="button" className="mt-1.5 text-xs font-semibold text-primary hover:underline">
              Forgot your password?
            </button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50 font-body"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>

          <p className="text-sm text-muted-foreground">
            Need an account?{" "}
            <Link to="/register" className="font-semibold text-primary hover:underline">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
