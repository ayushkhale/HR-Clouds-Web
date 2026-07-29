import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { HiArrowLeft, HiLockClosed } from "react-icons/hi";
import { authAPI } from "../../shared/api";

function ForgotPasswordPage() {
  const location = useLocation();
  const [identifier, setIdentifier] = useState(location.state?.identifier || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authAPI.forgotPassword({ identifier });
      const reqId = res.data?.requestId || res.requestId;
      navigate("/auth/otp", {
        state: {
          identifier,
          requestId: reqId,
          context: "forgot_password",
        },
      });
    } catch (err) {
      setError(err.message || "We couldn't find an account with that email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Back */}
      <Link
        to="/auth/login"
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <HiArrowLeft className="w-4 h-4" />
        Back to Sign In
      </Link>

      {/* Lock icon */}
      <div className="flex justify-center mb-5">
        <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center">
          <HiLockClosed className="w-6 h-6 text-purple-600" />
        </div>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-1 text-center">Forgot password?</h2>
      <p className="text-sm text-gray-500 mb-7 text-center">
        Enter your registered email and we'll send you a verification code to reset your password.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address <span className="text-red-400">*</span></label>
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

        {error && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm rounded-xl py-2.5 transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? "Sending code…" : "Send Reset Code"}
        </button>
      </form>

      <p className="text-center text-xs text-gray-500 mt-6">
        Remembered it?{" "}
        <Link to="/auth/login" className="text-purple-600 hover:text-purple-700 font-semibold">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default ForgotPasswordPage;
