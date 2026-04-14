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
    <div className="flex min-h-screen items-center justify-center bg-[#5865f2]">
      <div className="w-full max-w-[480px] rounded-md bg-[#313338] p-8 shadow-lg">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-semibold text-white">Welcome back!</h1>
          <p className="mt-1 text-base text-[#b5bac1]">We're so excited to see you again!</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#b5bac1]">
              Email or Phone Number <span className="text-[#f23f42]">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-[3px] border-none bg-[#1e1f22] px-3 py-2.5 text-base text-white outline-none placeholder:text-[#87898c] focus:ring-0"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#b5bac1]">
              Password <span className="text-[#f23f42]">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-[3px] border-none bg-[#1e1f22] px-3 py-2.5 text-base text-white outline-none placeholder:text-[#87898c] focus:ring-0"
            />
            <button type="button" className="mt-1 text-sm font-medium text-[#00a8fc] hover:underline">
              Forgot your password?
            </button>
          </div>

          {error && <p className="text-sm text-[#f23f42]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[3px] bg-[#5865f2] py-2.5 text-base font-medium text-white transition-colors hover:bg-[#4752c4] disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>

          <p className="text-sm text-[#949ba4]">
            Need an account?{" "}
            <Link to="/register" className="font-medium text-[#00a8fc] hover:underline">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
