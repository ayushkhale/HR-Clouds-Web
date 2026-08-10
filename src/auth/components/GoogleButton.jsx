import React, { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { authAPI, tokenHelper } from "../../shared/api";

/**
 * GoogleButton — renders the official Google Sign-In button
 * and sends the real ID Token (JWT) to the POST /auth/google endpoint.
 * @param {{ onSuccess?: (user) => void, onError?: (msg) => void, onMultiOrg?: (selectionToken, orgs) => void }} props
 */
function GoogleButton({ onSuccess, onError, onMultiOrg }) {
  const [loading, setLoading] = useState(false);

  async function handleSuccess(credentialResponse) {
    if (!credentialResponse.credential) {
      onError?.("No Google credential returned.");
      return;
    }

    setLoading(true);
    try {
      // Exchange the real Google ID Token (credential) for our app's JWT
      const res = await authAPI.googleAuth({ idToken: credentialResponse.credential });

      // Multi-org: user belongs to multiple organizations
      const isMultiOrg = res.data?.requires_org_selection || res.requires_org_selection;
      const selToken = res.data?.selection_token || res.selection_token;
      const orgsList = res.data?.organizations || res.organizations || [];

      if (isMultiOrg && selToken) {
        onMultiOrg?.(selToken, orgsList);
        return;
      }

      // Single org or guest
      onSuccess?.(res);
    } catch (err) {
      onError?.(err.message || "Google sign-in failed on server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full flex justify-center relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-xl">
          <svg className="w-5 h-5 animate-spin text-purple-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      )}
      <div className="w-full min-h-[40px] flex justify-center">
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={() => {
            onError?.("Google sign-in was cancelled or failed.");
          }}
          useOneTap
          theme="outline"
          size="large"
          shape="rectangular"
          width="384"
        />
      </div>
    </div>
  );
}

export default GoogleButton;
