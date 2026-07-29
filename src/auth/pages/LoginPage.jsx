import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { HiEye, HiEyeOff } from "react-icons/hi";
import { authAPI, tokenHelper } from "../../shared/api";
import { useAuth } from "../../shared/contexts/AuthContext";
import GoogleButton from "../components/GoogleButton";

function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, startOrgSelection, getDashboardPath } = useAuth();

  // Check for a redirect URL (e.g. from invitation flow)
  const redirectUrl = searchParams.get("redirect");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authAPI.login({ identifier, password });

      // Case 1: Multi-org — user belongs to multiple organizations
      const isMultiOrg = res.data?.requires_org_selection || res.requires_org_selection;
      const selToken = res.data?.selection_token || res.selection_token;
      const orgsList = res.data?.organizations || res.organizations || [];

      if (isMultiOrg && selToken) {
        startOrgSelection(selToken, orgsList);
        navigate("/auth/select-org");
        return;
      }

      // Case 2: Single org or guest — direct login
      const authData = login(res);
      const targetRole = authData?.role || authData?.user?.role;

      // Route to redirect URL or role-based dashboard
      if (redirectUrl) {
        navigate(redirectUrl);
      } else {
        navigate(getDashboardPath(targetRole));
      }
    } catch (err) {
      setError(err.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h2>
      <p className="text-sm text-gray-500 mb-7">Sign in to your HR Clouds account</p>

      <GoogleButton
        onSuccess={(user) => {
          login(user);
          if (redirectUrl) {
            navigate(redirectUrl);
          } else {
            navigate(getDashboardPath(user.role));
          }
        }}
        onMultiOrg={(selToken, orgs) => {
          startOrgSelection(selToken, orgs);
          navigate("/auth/select-org");
        }}
        onError={(msg) => setError(msg)}
      />

      <div className="flex items-center gap-3 my-5">
        <hr className="flex-1 border-gray-200" />
        <span className="text-xs text-gray-400">or continue with email</span>
        <hr className="flex-1 border-gray-200" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Email Address <span className="text-red-400">*</span>
          </label>
          <input
            type="email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@company.com"
            required
            autoComplete="email"
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all bg-white"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-gray-700">
              Password <span className="text-red-400">*</span>
            </label>
            <Link to="/auth/forgot-password" state={{ identifier }} className="text-xs text-purple-600 hover:text-purple-700 font-medium">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 pr-11 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all bg-white"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
            >
              {showPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold text-sm rounded-xl py-3 transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed shadow-sm shadow-purple-200 mt-1"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <p className="text-center text-[11px] text-gray-400 mt-7 leading-relaxed">
        By signing in, you agree to our{" "}
        <a href="#" className="text-purple-600 hover:underline">Terms of Service</a>{" "}
        and{" "}
        <a href="#" className="text-purple-600 hover:underline">Privacy Policy</a>.
      </p>
    </div>
  );
}

export default LoginPage;
