import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authAPI, tokenHelper } from "../../shared/api";
import { useAuth } from "../../shared/contexts/AuthContext";
import GoogleButton from "../components/GoogleButton";

function RegisterPage() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { login, startOrgSelection, getDashboardPath } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authAPI.initiateSignup({ identifier });
      const reqId = res.data?.requestId || res.requestId;
      navigate("/auth/otp", {
        state: {
          identifier,
          requestId: reqId,
          context: "registration",
        },
      });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Create your account</h2>
      <p className="text-sm text-gray-500 mb-7">
        Get started with HR Clouds — no credit card required.
      </p>

      <GoogleButton
        onSuccess={(res) => {
          console.log("Google Signup/Login Success:", res);
          const authData = login(res);
          const targetRole = authData?.role || authData?.user?.role;
          navigate(getDashboardPath(targetRole));
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
            Work Email <span className="text-red-400">*</span>
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
          <p className="text-xs text-gray-400 mt-1.5">
            We'll send a verification code to this address.
          </p>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold text-sm rounded-xl py-3 transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed shadow-sm shadow-purple-200"
        >
          {loading ? "Sending code…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

export default RegisterPage;
