import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { organizationAPI, tokenHelper } from "../../shared/api";
import { HiEye, HiEyeOff, HiCheck, HiExclamationCircle } from "react-icons/hi";

function InvitationAcceptPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("token");
  const storedAccessToken = tokenHelper.get();

  // States: "validating" | "action" | "success" | "error"
  const [pageState, setPageState] = useState("validating");
  const [inviteData, setInviteData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Action form
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  // Validate invitation on mount
  useEffect(() => {
    if (!inviteToken) {
      setPageState("error");
      setErrorMsg("No invitation token found in the URL.");
      return;
    }

    async function validate() {
      try {
        const res = await organizationAPI.validateInvitation(inviteToken);
        if (res.success && res.data) {
          setInviteData(res.data);

          // Existing user but not logged in → redirect to login with return URL
          if (!res.data.is_new_user && !storedAccessToken) {
            const returnUrl = `/invitation/accept?token=${encodeURIComponent(inviteToken)}`;
            navigate(`/auth/login?redirect=${encodeURIComponent(returnUrl)}`, { replace: true });
            return;
          }

          setPageState("action");
        } else {
          setPageState("error");
          setErrorMsg(res.message || "Invalid or expired invitation link.");
        }
      } catch (err) {
        setPageState("error");
        setErrorMsg(err.message || "Failed to validate invitation. The link may be expired.");
      }
    }

    validate();
  }, [inviteToken, storedAccessToken, navigate]);

  // Password validation
  function validatePassword(pwd) {
    if (pwd.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Z]/.test(pwd)) return "Must contain at least 1 uppercase letter.";
    if (!/[a-z]/.test(pwd)) return "Must contain at least 1 lowercase letter.";
    if (!/[0-9]/.test(pwd)) return "Must contain at least 1 number.";
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) return "Must contain at least 1 special character.";
    return null;
  }

  async function handleAccept(e) {
    e.preventDefault();
    setFormError("");

    if (inviteData?.is_new_user) {
      const pwdErr = validatePassword(password);
      if (pwdErr) { setFormError(pwdErr); return; }
      if (password !== confirmPassword) { setFormError("Passwords do not match."); return; }
    }

    setLoading(true);
    try {
      const payload = { token: inviteToken };
      if (inviteData?.is_new_user) {
        payload.password = password;
      }

      await organizationAPI.acceptInvitation(payload, inviteData?.is_new_user);
      setPageState("success");
    } catch (err) {
      setFormError(err.message || "Failed to accept invitation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Role display helper
  function formatRole(role) {
    if (!role) return "Member";
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  // ─── Error State ───────────────────────────────────────────────
  if (pageState === "error") {
    return (
      <PageWrapper>
        <div className="text-center">
          <div className="flex justify-center mb-6 relative">
             <div className="absolute inset-0 bg-red-100/50 rounded-full blur-2xl max-w-[120px] mx-auto"></div>
             <img 
               src="https://cdn3d.iconscout.com/3d/premium/thumb/something-went-wrong-3d-icon-png-download-13356832.png" 
               alt="Invalid Invitation" 
               className="w-32 h-32 object-contain relative z-10 drop-shadow-xl"
             />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Link Expired or Invalid</h1>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed max-w-xs mx-auto">
            {errorMsg || "This invitation link is no longer valid. Please request a new invitation from your HR."}
          </p>
          <Link
            to="/auth/login"
            className="w-full inline-block py-3.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 active:bg-purple-800 transition-all shadow-sm shadow-purple-200"
          >
            Go back to Login
          </Link>
        </div>
      </PageWrapper>
    );
  }

  // ─── Validating State ──────────────────────────────────────────
  if (pageState === "validating") {
    return (
      <PageWrapper>
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Verifying Invitation…</h1>
          <p className="text-sm text-gray-500 mb-6">Please wait while we securely verify your invitation link.</p>
          <svg className="w-8 h-8 animate-spin text-purple-600 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      </PageWrapper>
    );
  }

  // ─── Success State ─────────────────────────────────────────────
  if (pageState === "success") {
    return (
      <PageWrapper>
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <HiCheck className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">You're In! 🎉</h1>
          <p className="text-sm text-gray-500 mb-6">
            Your invitation has been accepted. You are now a {formatRole(inviteData?.role)}{inviteData?.org_name ? ` at ${inviteData.org_name}` : ""}.
          </p>
          <button
            onClick={() => navigate("/auth/login", { replace: true })}
            className="w-full py-3 bg-purple-600 text-white font-semibold text-sm rounded-xl hover:bg-purple-700 transition-colors cursor-pointer"
          >
            Go to Login →
          </button>
        </div>
      </PageWrapper>
    );
  }

  // ─── Action State ──────────────────────────────────────────────
  return (
    <PageWrapper>
      <div className="text-center mb-6">
        <img 
          src={inviteData?.org_logo || "https://cdn.prod.website-files.com/6418f5bfe5bc0a8254109c28/667e99d3ee6daa0951a4c1b7_Mini%20Guide%20Teamorga.webp"} 
          alt={inviteData?.org_name || "Organization"} 
          className="w-16 h-16 rounded-2xl object-cover mx-auto mb-4 shadow-sm border border-gray-100" 
        />
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {inviteData?.org_name ? `Join ${inviteData.org_name}` : "Accept Invitation"}
        </h1>
        <p className="text-sm text-gray-500">
          You've been invited to join as <span className="font-semibold text-purple-600">{formatRole(inviteData?.role)}</span>
        </p>
      </div>

      {/* Existing user flow */}
      {!inviteData?.is_new_user && (
        <div className="mb-5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
          <p className="text-sm text-emerald-700 font-medium">
            ✓ We found your existing account ({inviteData?.email})
          </p>
          <p className="text-xs text-emerald-600 mt-1">Click below to join this organization.</p>
        </div>
      )}

      <form onSubmit={handleAccept} className="space-y-4">
        {/* New user: password creation */}
        {inviteData?.is_new_user && (
          <>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl mb-2">
              <p className="text-sm text-blue-700 font-medium">
                Welcome! Create a password for <span className="font-semibold">{inviteData?.email}</span>
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Create Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 chars, 1 upper, 1 lower, 1 number, 1 special"
                  required
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

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Confirm Password <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all bg-white"
              />
            </div>
          </>
        )}

        {formError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold text-sm rounded-xl py-3 transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed shadow-sm shadow-purple-200"
        >
          {loading ? "Joining…" : "Join Organization →"}
        </button>
      </form>

      <p className="text-center text-xs text-gray-400 mt-6">
        Wrong account?{" "}
        <Link to="/auth/login" className="text-purple-600 hover:underline">Sign in with a different account</Link>
      </p>
    </PageWrapper>
  );
}

// Standalone page wrapper (not inside AuthLayout)
function PageWrapper({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export default InvitationAcceptPage;
