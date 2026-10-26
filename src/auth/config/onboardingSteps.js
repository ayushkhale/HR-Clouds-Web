// ─────────────────────────────────────────────────────────────────────────────
// auth/config/onboardingSteps.js — The canonical 3-step onboarding model.
//
// Shared between GuestDashboard and RegisterOrgPage so both agree on step counts,
// labels, and semantic indicators.
// ─────────────────────────────────────────────────────────────────────────────

export const ONBOARDING_STEPS = Object.freeze([
  { step: 1, label: "Choose how to start", path: "/dashboard/guest" },
  { step: 2, label: "Choose your plan", path: "/register-organization" },
  { step: 3, label: "Organisation details", path: "/register-organization" },
]);

export const TOTAL_STEPS = ONBOARDING_STEPS.length; // 3

export function getStepMeta(stepNumber) {
  return ONBOARDING_STEPS.find((s) => s.step === stepNumber) || ONBOARDING_STEPS[0];
}
