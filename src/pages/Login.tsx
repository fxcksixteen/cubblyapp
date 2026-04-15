import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff } from "lucide-react";

const Login = () => {
  const { session } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (session) return <Navigate to="/@me" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const trimmed = identifier.trim();

    // If it looks like an email, sign in directly
    if (trimmed.includes("@")) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: trimmed, password });
      if (signInError) setError(signInError.message);
      setLoading(false);
      return;
    }

    // Username login — use server-side function (never exposes email)
    const { data, error: fnError } = await supabase.functions.invoke("login-with-username", {
      body: { username: trimmed.toLowerCase(), password },
    });

    if (fnError || !data?.access_token) {
      setError(data?.error || "Invalid username or password.");
      setLoading(false);
      return;
    }

    // Set the session from the returned tokens
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });

    if (sessionError) setError(sessionError.message);
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
              Email or Username
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary font-body"
              placeholder="bear@cubbly.app"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary font-body"
                placeholder="••••••••"
              />
              {password.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
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
