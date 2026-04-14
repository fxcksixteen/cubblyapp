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
    <div className="flex min-h-screen items-center justify-center bg-[#5865f2]">
      <div className="w-full max-w-[480px] rounded-md bg-[#313338] p-8 shadow-lg">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-semibold text-white">Create an account</h1>
        </div>

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#b5bac1]">
              Email <span className="text-[#f23f42]">*</span>
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
              Display Name <span className="text-[#f23f42]">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full rounded-[3px] border-none bg-[#1e1f22] px-3 py-2.5 text-base text-white outline-none placeholder:text-[#87898c] focus:ring-0"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#b5bac1]">
              Username <span className="text-[#f23f42]">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
              minLength={6}
              className="w-full rounded-[3px] border-none bg-[#1e1f22] px-3 py-2.5 text-base text-white outline-none placeholder:text-[#87898c] focus:ring-0"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#b5bac1]">
              Date of Birth <span className="text-[#f23f42]">*</span>
            </label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
              className="w-full rounded-[3px] border-none bg-[#1e1f22] px-3 py-2.5 text-base text-white outline-none placeholder:text-[#87898c] focus:ring-0 [color-scheme:dark]"
            />
          </div>

          {error && <p className="text-sm text-[#f23f42]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full rounded-[3px] bg-[#5865f2] py-2.5 text-base font-medium text-white transition-colors hover:bg-[#4752c4] disabled:opacity-50"
          >
            {loading ? "Creating..." : "Continue"}
          </button>

          <p className="text-xs text-[#949ba4]">
            By registering, you agree to Cubbly's{" "}
            <a href="#" className="text-[#00a8fc] hover:underline">Terms of Service</a> and{" "}
            <a href="#" className="text-[#00a8fc] hover:underline">Privacy Policy</a>.
          </p>

          <p className="text-sm text-[#949ba4]">
            <Link to="/login" className="font-medium text-[#00a8fc] hover:underline">
              Already have an account?
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Register;
