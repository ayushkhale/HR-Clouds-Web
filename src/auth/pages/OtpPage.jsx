import React, { useState, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { HiArrowLeft, HiEye, HiEyeOff, HiCheckCircle } from "react-icons/hi";
import OtpInput from "../components/OtpInput";
import { authAPI, tokenHelper } from "../../shared/api";
import { useAuth } from "../../shared/contexts/AuthContext";

const OTP_TIMER_SECONDS = 60; // 1 minute

function maskEmail(email = "") {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - 2, 2))}@${domain}`;
}

function PasswordStrength({ password }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const colors = ["bg-gray-200", "bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-emerald-400", "bg-emerald-500"];
  const labels = ["", "Very weak", "Weak", "Fair", "Good", "Strong"];

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i < score ? colors[score] : "bg-gray-200"}`}
          />
        ))}
      </div>
      <p className={`text-[11px] mt-1 ${score <= 2 ? "text-red-500" : score <= 3 ? "text-yellow-600" : "text-emerald-600"}`}>
        {labels[score]}
      </p>
    </div>
  );
}

function OtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state;
  const { login, getDashboardPath } = useAuth();

  // Guard: if no state was passed, redirect back to register
  useEffect(() => {
    if (!state?.identifier || !state?.requestId || !state?.context) {
      navigate("/auth/register", { replace: true });
    }
  }, [state, navigate]);

  const { identifier = "", context = "registration" } = state || {};
  const [requestId, setRequestId] = useState(state?.requestId || "");

  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [timer, setTimer] = useState(OTP_TIMER_SECONDS);
  const [success, setSuccess] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (timer <= 0) return;
    const id = setTimeout(() => setTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  const formatTimer = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const isRegistration = context === "registration";
  const isForgotPassword = context === "forgot_password";
  const needsPassword = isRegistration || isForgotPassword;

  async function handleResend() {
    if (timer > 0 || resending) return;
    setResending(true);
    setError("");
    try {
      const res = await authAPI.resendOtp({ identifier, context, requestId });
      setRequestId(res.requestId);
      setTimer(OTP_TIMER_SECONDS);
      setOtp("");
    } catch (err) {
      setError(err.message || "Failed to resend OTP. Please try again.");
    } finally {
      setResending(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (otp.length !== 6) {
      setError("Please enter the complete 6-digit OTP.");
      return;
    }

    if (needsPassword && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      if (isRegistration) {
        const res = await authAPI.verifySignupOtp({
          identifier,
          otp,
          context,
          password,
          requestId,
        });
        const user = res.data?.user || res.user || res;
        const { accessToken, refreshToken } = user;
        tokenHelper.save(accessToken, refreshToken);
        login(user);
        navigate(getDashboardPath(user.role));

      } else if (isForgotPassword) {
        await authAPI.verifyForgotPasswordOtp({
          identifier,
          otp,
          context,
          requestId,
          newPassword: password,
        });
        setSuccess(true);
      }
    } catch (err) {
      setError(err.message || "Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Password reset success screen
  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <HiCheckCircle className="w-14 h-14 text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Password Reset!</h2>
        <p className="text-sm text-gray-500">
          Your password has been updated successfully. You can now sign in with your new password.
        </p>
        <Link
          to="/auth/login"
          className="block w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm rounded-xl py-2.5 transition-colors text-center mt-4"
        >
          Back to Sign In
        </Link>
      </div>
    );
  }

  const backPath = isRegistration ? "/auth/register" : "/auth/forgot-password";

  return (
    <div>
      {/* Back link */}
      <Link
        to={backPath}
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <HiArrowLeft className="w-4 h-4" />
        Back
      </Link>

      <h2 className="text-xl font-bold text-gray-900 mb-1">Verify your email</h2>
      <p className="text-sm text-gray-500 mb-7">
        We sent a 6-digit code to{" "}
        <span className="font-medium text-gray-700">{maskEmail(identifier)}</span>
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* OTP Boxes */}
        <div>
          <OtpInput value={otp} onChange={setOtp} disabled={loading} />
          {/* Timer + resend */}
          <div className="flex items-center justify-center gap-2 mt-3">
            {timer > 0 ? (
              <span className="text-xs text-gray-400">
                Resend code in <span className="font-semibold text-gray-600">{formatTimer(timer)}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-xs text-purple-600 hover:text-purple-700 font-semibold disabled:opacity-50 transition-colors"
              >
                {resending ? "Sending…" : "Resend OTP"}
              </button>
            )}
          </div>
        </div>

        {/* Password fields — shown for both registration and forgot_password */}
        {needsPassword && (
          <>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {isForgotPassword ? "New Password" : "Set Password"} <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 chars, 1 uppercase, 1 number, 1 symbol"
                  required
                  className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 pr-11 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <HiEyeOff className="w-4 h-4" /> : <HiEye className="w-4 h-4" />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Confirm Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  className={`w-full border-2 rounded-xl px-4 py-2.5 pr-11 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 transition-all bg-white ${
                    confirmPassword && confirmPassword !== password
                      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                      : "border-gray-300 focus:border-purple-500 focus:ring-purple-100"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showConfirm ? <HiEyeOff className="w-4 h-4" /> : <HiEye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && confirmPassword !== password && (
                <p className="text-[11px] text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>
          </>
        )}

        {error && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || otp.length !== 6}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm rounded-xl py-2.5 transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading
            ? "Verifying…"
            : isRegistration
            ? "Verify & Create Account"
            : "Verify & Reset Password"}
        </button>
      </form>
    </div>
  );
}

export default OtpPage;
