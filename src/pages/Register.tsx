import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const Register = () => {
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (session) return <Navigate to="/@me" replace />;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          username,
          date_of_birth: dob,
        },
      },
    });

    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 font-body">
      {/* 16:9 landscape card */}
      <div className="flex w-full max-w-[960px] overflow-hidden rounded-3xl shadow-2xl" style={{ aspectRatio: "16/9" }}>
        {/* Left half — image placeholder */}
        <div className="hidden md:flex w-1/2 items-center justify-center bg-gradient-to-br from-primary/30 via-primary/10 to-background relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(32,80%,50%)]/20 via-[hsl(32,80%,35%)]/10 to-transparent" />
          <div className="relative z-10 flex flex-col items-center gap-4 px-8 text-center">
            <div className="text-6xl">🧸</div>
            <h2 className="font-display text-3xl font-extrabold text-foreground">
              Your <span style={{ color: "hsl(32, 80%, 42%)" }}>cozy</span> corner
            </h2>
            <p className="text-sm text-muted-foreground font-body">Image or animation coming soon</p>
          </div>
        </div>

        {/* Right half — form */}
        <div className="flex w-full md:w-1/2 flex-col justify-center bg-card px-8 py-6 lg:px-12">
          <div className="mb-5">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
              Create an account
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Join the coziest place on the internet.
            </p>
          </div>

          <form onSubmit={handleRegister} className="flex flex-col gap-3.5">
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
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary font-body"
                placeholder="Cozy Bear"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary font-body"
                placeholder="cozybear"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary font-body"
                  placeholder="••••••••"
                />
              </div>
              <div className="w-[140px]">
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Birthday
                </label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary font-body [color-scheme:dark]"
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50 font-body"
            >
              {loading ? "Creating..." : "Continue"}
            </button>

            <p className="text-xs text-muted-foreground">
              By registering, you agree to Cubbly's{" "}
              <a href="#" className="text-primary hover:underline">Terms of Service</a> and{" "}
              <a href="#" className="text-primary hover:underline">Privacy Policy</a>.
            </p>

            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-primary hover:underline">
                Log in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Register;
