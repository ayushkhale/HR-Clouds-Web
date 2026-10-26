import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { organizationAPI, tokenHelper } from "../../shared/api";
import { useAuth } from "../../shared/contexts/AuthContext";
import { WorkspaceContext } from "../../shared/contexts/WorkspaceContext";
import {
  HiCheck,
  HiArrowLeft,
  HiArrowRight,
  HiOfficeBuilding,
  HiExclamationCircle,
  HiRefresh,
  HiSparkles,
} from "react-icons/hi";
import hrcloudsLogo from "../../assets/logo2.png";
import {
  planCodeFor,
  formatPlanPrice,
  planPeriodLabel,
  planBullets,
  bestYearlySavingPct,
  variantFor,
  limitsFor,
} from "../../shared/config/plans";
import usePlanCatalog from "../../shared/hooks/usePlanCatalog";
import { organizationErrorMessage } from "../../shared/utils/organizationErrors";
import { readPlanIntent, clearPlanIntent } from "../../shared/config/planIntent";
import { INDUSTRY_OPTIONS } from "../../shared/organization/orgProfileMeta";
import { ONBOARDING_STEPS, TOTAL_STEPS } from "../config/onboardingSteps";
import { focusFirstProblem } from "../../shared/utils/formGuard";
import { HelpLabel } from "../../shared/fieldHelp/FieldHelp";
import Skeleton from "../../shared/components/Skeleton";
import { ENV } from "../../config/env";

const INDUSTRIES = INDUSTRY_OPTIONS;
const SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];

const bucketFloor = (bucket) => parseInt(bucket, 10) || 0;
const sizesForPlan = (plan, cycle) => {
  if (!plan) return SIZES;
  const limits = limitsFor(plan, cycle || "monthly");
  return SIZES.filter((b) => bucketFloor(b) <= limits.employees);
};

/* Literal class map per catalogue length so Tailwind scans full strings. */
const GRID = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
};

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (document.getElementById("razorpay-script")) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const PENDING_ORG_KEY = "hrclouds_pending_org_id";

function RegisterOrgPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, getDashboardPath, role, user, isLoading: authLoading } = useAuth();

  // Step 1: select plan; Step 2: enter details
  const [step, setStep] = useState(1);
  const [billing, setBilling] = useState("monthly"); // monthly | yearly
  const [selectedTier, setSelectedTier] = useState(null);

  // Form state & CLAUDE.md §11 validation
  const [form, setForm] = useState({
    org_name: "",
    org_alias: "",
    industry: "",
    size: "",
    website: "",
    phone_number: "",
    gst_number: "",
    company_pan_number: "",
  });
  const [attempted, setAttempted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const stepHeadingRef = useRef(null);

  const {
    plans,
    source: planSource,
    loading: plansLoading,
    error: plansError,
    reload: reloadPlans,
  } = usePlanCatalog();
  const planByTier = useMemo(() => Object.fromEntries(plans.map((p) => [p.tier, p])), [plans]);

  useEffect(() => {
    loadRazorpayScript();
  }, []);

  const [parkedChoice] = useState(() => {
    const parked = readPlanIntent();
    const choice = {
      tier: searchParams.get("plan") || parked?.tier || null,
      cycle: searchParams.get("billing") || parked?.billing || null,
    };
    clearPlanIntent();
    return choice;
  });

  useEffect(() => {
    if (parkedChoice.cycle === "yearly" || parkedChoice.cycle === "monthly") {
      setBilling(parkedChoice.cycle);
    }
  }, [parkedChoice]);

  const choiceApplied = useRef(false);
  useEffect(() => {
    if (choiceApplied.current || plansLoading || !parkedChoice.tier) return;
    choiceApplied.current = true;
    if (planByTier[parkedChoice.tier]) {
      setSelectedTier(parkedChoice.tier);
      setStep(2);
    }
  }, [parkedChoice, planByTier, plansLoading]);

  // Auth guard: send to login if signed out, or to workspace dashboard if already in an org
  useEffect(() => {
    if (authLoading) return;
    if (!tokenHelper.get()) {
      navigate("/auth/login", { replace: true });
      return;
    }
    if (role && role !== "guest") {
      navigate(getDashboardPath(), { replace: true });
    }
  }, [navigate, role, getDashboardPath, authLoading]);

  const selectedPlan = selectedTier ? planByTier[selectedTier] || null : null;
  const selectedVariant = variantFor(selectedPlan, billing);
  const selectedLimits = limitsFor(selectedPlan, billing);
  const isFreePlan = selectedVariant ? selectedVariant.amount === 0 : false;

  useEffect(() => {
    if (isFreePlan) {
      setForm((prev) => ({ ...prev, size: "1-10" }));
    }
  }, [isFreePlan]);

  const availableSizes = sizesForPlan(selectedPlan, billing);

  useEffect(() => {
    if (form.size && !availableSizes.includes(form.size)) {
      setForm((prev) => ({ ...prev, size: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSizes.join("|")]);

  // Smooth scroll and focus heading on step change
  function changeStep(newStep) {
    setStep(newStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      stepHeadingRef.current?.focus();
    }, 50);
  }

  function handleFormChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Problems map (CLAUDE.md §11)
  const problems = useMemo(() => {
    const p = {};
    const name = (form.org_name || "").trim();
    if (!name) {
      p.org_name = "Organization name is required.";
    } else if (name.length < 2) {
      p.org_name = "Organization name must be at least 2 characters.";
    } else if (name.length > 150) {
      p.org_name = "Organization name must be 150 characters or fewer.";
    }

    if (!form.size) {
      p.size = "Please select a company size.";
    } else if (!availableSizes.includes(form.size)) {
      p.size = `This plan only covers up to ${selectedLimits?.employees ?? "its seat limit"} employees.`;
    }

    if (form.org_alias && form.org_alias.length > 100) {
      p.org_alias = "Alias must be 100 characters or fewer.";
    }

    if (form.website && form.website.trim().length > 255) {
      p.website = "Website must be 255 characters or fewer.";
    }

    if (form.phone_number && form.phone_number.trim().length > 20) {
      p.phone_number = "Contact number must be 20 digits or fewer.";
    }

    if (form.gst_number && form.gst_number.trim().length > 50) {
      p.gst_number = "GST number must be 50 characters or fewer.";
    }

    if (form.company_pan_number && form.company_pan_number.trim().length > 50) {
      p.company_pan_number = "Company PAN must be 50 characters or fewer.";
    }

    return p;
  }, [form, availableSizes, selectedLimits]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedPlan) {
      setError("That plan isn’t available any more. Pick another one.");
      return;
    }

    const planCode = planCodeFor(selectedPlan, billing);
    if (planSource !== "live" && !isFreePlan) {
      setError("We couldn’t confirm today’s prices just now. Reload the plans and try again — nothing has been charged.");
      return;
    }
    if (!planCode) {
      setError("That plan isn’t available any more. Pick another one.");
      return;
    }

    if (focusFirstProblem(problems, (k) => `reg-org-${k}`)) {
      setAttempted(true);
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await organizationAPI.initiateRegistration({
        plan_code: planCode,
        ...form,
      });

      // Free plan instant activation
      if (res.data?.accessToken || res.data?.user?.accessToken || res.data?.status === "active") {
        login(res);
        setSuccess(true);
        setTimeout(() => navigate(getDashboardPath("hr"), { replace: true }), 1500);
        return;
      }

      // Paid plan Razorpay checkout
      const rzpOrder =
        res.data?.razorpay_order ||
        res.data?.payment ||
        res.data?.razorpay ||
        res.data;

      const orderId =
        rzpOrder?.id ||
        rzpOrder?.order_id ||
        rzpOrder?.orderId ||
        res.data?.order_id ||
        res.data?.orderId;

      const amount = rzpOrder?.amount ?? res.data?.amount;
      const currency = rzpOrder?.currency || res.data?.currency || "INR";
      const orgId =
        res.data?.org_id ||
        res.data?.organization?.id ||
        res.data?.org?.id ||
        rzpOrder?.receipt;

      const keyId =
        res.data?.razorpay_key_id ||
        res.data?.key_id ||
        rzpOrder?.key_id ||
        ENV.RAZORPAY_KEY_ID;

      if (!orderId || !orgId) {
        throw new Error("Invalid payment session returned by server.");
      }

      sessionStorage.setItem(PENDING_ORG_KEY, orgId);

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || typeof window.Razorpay !== "function") {
        throw new Error(
          "Unable to load Razorpay payment gateway. Please check your internet connection or ad-blocker."
        );
      }

      const options = {
        key: keyId,
        amount: Number(amount),
        currency,
        name: "HR Clouds",
        description: `Subscription for ${form.org_name || "Workspace"} (${selectedPlan.name} Plan)`,
        order_id: orderId,
        theme: { color: "#7c3aed" },
        prefill: {
          name: `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || undefined,
          email: user?.email || undefined,
          contact: form.phone_number || undefined,
        },
        handler: async (paymentRes) => {
          setLoading(true);
          try {
            const verifyRes = await organizationAPI.verifyPayment({
              razorpay_payment_id: paymentRes.razorpay_payment_id,
              razorpay_order_id: paymentRes.razorpay_order_id,
              razorpay_signature: paymentRes.razorpay_signature,
              org_id: orgId,
            });

            sessionStorage.removeItem(PENDING_ORG_KEY);
            login(verifyRes);
            setSuccess(true);
            setTimeout(() => navigate(getDashboardPath("hr"), { replace: true }), 1500);
          } catch (err) {
            setError(
              organizationErrorMessage(
                err,
                "Payment was received but organization setup is pending. Don't pay again — check your email or contact support."
              )
            );
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
            setError("Payment was cancelled. You can retry anytime — your organization has been saved.");
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (failedRes) => {
        setLoading(false);
        setError(failedRes.error?.description || "Payment failed. Please try a different card or UPI ID.");
      });
      rzp.open();
    } catch (err) {
      setError(organizationErrorMessage(err, "We couldn't set up your organization. Try again."));
      setLoading(false);
    }
  }

  // Auth still hydrating from localStorage
  if (authLoading) {
    return <Skeleton type="app" />;
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div
          role="status"
          aria-live="polite"
          className="max-w-md w-full bg-white rounded-2xl border border-gray-200 shadow-xl p-8 text-center"
        >
          <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HiCheck className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to HR Clouds!</h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Your organization <strong className="text-gray-900">{form.org_name}</strong> is ready. Taking you to your dashboard…
          </p>
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-purple-600">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Loading your new workspace…
          </div>
        </div>
      </div>
    );
  }

  const yearlyDiscount = bestYearlySavingPct(plans);

  // Form input field helper classes
  const inputClass = (field) => {
    const isError = attempted && Boolean(problems[field]);
    const base = "w-full border-2 rounded-xl px-4 py-2.5 text-sm outline-none transition-all";
    if (isError) {
      return `${base} border-rose-400 bg-rose-50/20 text-gray-900 placeholder-gray-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100`;
    }
    return `${base} border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-100`;
  };

  return (
    <WorkspaceContext.Provider value="guest">
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        {/* Top Header */}
        <header className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Link to="/" aria-label="HR Clouds — home">
              <img src={hrcloudsLogo} alt="HR Clouds" className="h-9 w-auto object-contain" />
            </Link>

            <div className="flex items-center gap-4">
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => changeStep(1)}
                  className="text-xs font-semibold text-gray-500 hover:text-purple-600 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <HiArrowLeft className="w-3.5 h-3.5" /> Change Selected Plan
                </button>
              )}
              <Link
                to="/dashboard/guest"
                className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </div>
        </header>

        {/* Main Step Content */}
        <main className="flex-grow flex flex-col items-center justify-center px-4 sm:px-6 py-10 max-w-6xl w-full mx-auto">
          
          {/* STEP 1: Select Plan */}
          {step === 1 && (
            <div className="w-full">
              {/* Step Header */}
              <div className="text-center mb-8">
                <nav aria-label="Onboarding progress" className="mb-3">
                  <span
                    aria-current="step"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-100 text-purple-700 text-xs font-semibold"
                  >
                    <HiSparkles className="w-3.5 h-3.5 text-purple-600" />
                    Onboarding • Step 2 of {TOTAL_STEPS}: {ONBOARDING_STEPS[1].label}
                  </span>
                </nav>
                <h1
                  ref={stepHeadingRef}
                  tabIndex={-1}
                  className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-2 outline-none"
                >
                  <HelpLabel
                    text="Choose your plan"
                    help={{ surface: "organization.registration", field: "page" }}
                  />
                </h1>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  Pick a plan that fits your team. You can switch or cancel anytime.
                </p>

                {/* Billing Cycle Toggle (Tablist) */}
                <div className="flex items-center justify-center gap-2 mt-6">
                  <div
                    role="tablist"
                    aria-label="Billing cycle"
                    className="inline-flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={billing === "monthly"}
                      onClick={() => setBilling("monthly")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer ${
                        billing === "monthly"
                          ? "bg-white text-purple-700 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Monthly billing
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={billing === "yearly"}
                      onClick={() => setBilling("yearly")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer ${
                        billing === "yearly"
                          ? "bg-white text-purple-700 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Annual billing
                      {yearlyDiscount > 0 && (
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                            billing === "yearly" ? "bg-violet-100 text-violet-700" : "bg-white/70 text-slate-500"
                          }`}
                        >
                          save {yearlyDiscount}%
                        </span>
                      )}
                    </button>
                  </div>
                  <HelpLabel
                    text=""
                    help={{ surface: "organization.registration", field: "billing_cycle" }}
                  />
                </div>
              </div>

              {/* Plans read error banner */}
              {plansError && (
                <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <HiExclamationCircle className="w-4 h-4 shrink-0 text-rose-500" />
                    <span>{plansError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => reloadPlans()}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <HiRefresh className="w-3.5 h-3.5" /> Reload plans
                  </button>
                </div>
              )}

              {/* Empty state */}
              {!plansLoading && !plansError && plans.length === 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                  There are no plans on sale at the moment. Contact support and we’ll set one up for you.
                </div>
              )}

              {/* Skeletons while loading plans */}
              {plansLoading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between animate-pulse"
                    >
                      <div>
                        <div className="h-5 w-20 bg-slate-200 rounded-full mb-3" />
                        <div className="h-6 w-32 bg-slate-200 rounded-md mb-2" />
                        <div className="h-4 w-48 bg-slate-100 rounded-md mb-6" />
                        <div className="h-8 w-28 bg-slate-200 rounded-md mb-6" />
                        <div className="h-10 w-full bg-slate-200 rounded-xl mb-6" />
                        <div className="space-y-2.5">
                          <div className="h-3.5 w-full bg-slate-100 rounded" />
                          <div className="h-3.5 w-5/6 bg-slate-100 rounded" />
                          <div className="h-3.5 w-4/6 bg-slate-100 rounded" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Plan Cards Grid using literal class map */}
              {!plansLoading && plans.length > 0 && (
                <div className={`grid ${GRID[plans.length] || GRID[3]} gap-6 items-stretch`}>
                  {plans.map((plan) => {
                    const price = formatPlanPrice(plan, billing);
                    const isFree = plan.monthly.amount === 0;
                    return (
                      <div
                        key={plan.tier}
                        className={`bg-white rounded-2xl p-6 flex flex-col transition-all duration-200 relative ${
                          plan.popular
                            ? "border-2 border-purple-500 shadow-md shadow-purple-100"
                            : "border border-slate-200 hover:border-purple-300 shadow-xs hover:shadow-sm"
                        }`}
                      >
                        <div className="h-5 mb-1.5 flex items-center">
                          {plan.popular ? (
                            <span className="inline-flex items-center px-2 py-0.5 bg-purple-600 text-white text-[10px] font-bold tracking-wider rounded-full uppercase">
                              Most Popular
                            </span>
                          ) : null}
                        </div>

                        <h2 className="text-lg font-bold text-gray-900">{plan.name}</h2>
                        <p className="text-xs text-gray-500 mt-1 min-h-[32px] leading-relaxed">
                          {plan.tagline}
                        </p>

                        <div className="mt-4 mb-5">
                          <span className="text-3xl font-extrabold text-gray-900 tracking-tight">
                            {price}
                          </span>
                          <span className="text-xs text-gray-400 font-medium ml-1">
                            {isFree ? "forever" : planPeriodLabel(plan, billing)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTier(plan.tier);
                            changeStep(2);
                          }}
                          aria-label={`Select ${plan.name} plan`}
                          className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 mb-6 cursor-pointer ${
                            plan.popular
                              ? "bg-purple-600 hover:bg-purple-700 text-white shadow-sm shadow-purple-200"
                              : "bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-700"
                          }`}
                        >
                          Select Plan
                          <HiArrowRight className="w-3.5 h-3.5" />
                        </button>

                        <div className="border-t border-slate-100 pt-4 flex-grow">
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
                            Included with {plan.name}:
                          </p>
                          <ul className="space-y-2 text-xs text-gray-600">
                            {planBullets(plan).map((bullet, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <HiCheck className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footnote when running on fallback catalogue */}
              {planSource === "fallback" && (
                <p className="text-[11px] text-gray-400 text-center mt-6">
                  * Showing catalog guide prices. Final active pricing will be validated before checkout.
                </p>
              )}
            </div>
          )}

          {/* STEP 2: Configure Workspace details (Max-W-3xl Widened Layout) */}
          {step === 2 && (
            <div className="max-w-3xl w-full mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-10">
              
              {!selectedPlan ? (
                <div className="text-center py-8">
                  <HiExclamationCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
                  <h2 className="text-lg font-bold text-gray-900 mb-1">That plan is no longer on offer</h2>
                  <p className="text-xs text-gray-500 mb-6">
                    Please return to the plan selection and pick another option.
                  </p>
                  <button
                    type="button"
                    onClick={() => changeStep(1)}
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-purple-200"
                  >
                    ← Choose another plan
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-left mb-6">
                    <nav aria-label="Onboarding progress" className="mb-2">
                      <span
                        aria-current="step"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-100 text-purple-700 text-xs font-semibold"
                      >
                        <HiSparkles className="w-3.5 h-3.5 text-purple-600" />
                        Onboarding • Step 3 of {TOTAL_STEPS}: {ONBOARDING_STEPS[2].label}
                      </span>
                    </nav>
                    <h1
                      ref={stepHeadingRef}
                      tabIndex={-1}
                      className="text-2xl font-bold text-gray-900 mb-1 outline-none"
                    >
                      Organisation details
                    </h1>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Enter your company information to set up your workspace under the{" "}
                      <span className="font-semibold text-purple-600">{selectedPlan?.name}</span>.
                    </p>
                  </div>

                  {/* Selected Plan Summary Badge without raw enum */}
                  <div className="flex items-center gap-3 mb-6 p-3.5 bg-purple-50/50 border border-purple-100 rounded-xl">
                    <div className="w-9 h-9 bg-purple-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
                      <HiOfficeBuilding className="w-5 h-5" />
                    </div>
                    <div className="flex-grow">
                      <p className="text-xs font-bold text-gray-900">
                        {isFreePlan
                          ? "Free Plan · free for as long as you like"
                          : `${selectedPlan?.name} · billed every ${billing === "yearly" ? "year" : "month"}`}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {isFreePlan
                          ? "Free forever"
                          : [formatPlanPrice(selectedPlan, billing), planPeriodLabel(selectedPlan, billing)].filter(Boolean).join(" ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => changeStep(1)}
                      className="text-xs text-purple-600 hover:text-purple-800 font-semibold cursor-pointer underline"
                    >
                      Change
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} noValidate className="space-y-4">
                    {/* Organization / Company Name */}
                    <div>
                      <label
                        htmlFor="reg-org-org_name"
                        className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5"
                      >
                        Organisation / Company Name <span className="text-rose-500" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="reg-org-org_name"
                        type="text"
                        value={form.org_name}
                        onChange={(e) => handleFormChange("org_name", e.target.value)}
                        placeholder="e.g. Acme Corp"
                        maxLength={150}
                        aria-required="true"
                        aria-invalid={attempted && Boolean(problems.org_name)}
                        className={inputClass("org_name")}
                      />
                      {attempted && problems.org_name && (
                        <p className="text-xs text-rose-600 mt-1" role="alert">
                          {problems.org_name}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Alias / Short Name */}
                      <div>
                        <label
                          htmlFor="reg-org-org_alias"
                          className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5"
                        >
                          Alias / Short Name <span className="text-gray-400 font-normal lowercase ml-1">(optional)</span>
                        </label>
                        <input
                          id="reg-org-org_alias"
                          type="text"
                          value={form.org_alias}
                          onChange={(e) => handleFormChange("org_alias", e.target.value)}
                          placeholder="e.g. Acme"
                          maxLength={100}
                          aria-invalid={attempted && Boolean(problems.org_alias)}
                          className={inputClass("org_alias")}
                        />
                        {attempted && problems.org_alias && (
                          <p className="text-xs text-rose-600 mt-1" role="alert">
                            {problems.org_alias}
                          </p>
                        )}
                      </div>

                      {/* Industry */}
                      <div>
                        <label
                          htmlFor="reg-org-industry"
                          className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5"
                        >
                          Industry <span className="text-gray-400 font-normal lowercase ml-1">(optional)</span>
                        </label>
                        <select
                          id="reg-org-industry"
                          value={form.industry}
                          onChange={(e) => handleFormChange("industry", e.target.value)}
                          className={inputClass("industry")}
                        >
                          <option value="">Select industry</option>
                          {INDUSTRIES.map((i) => (
                            <option key={i} value={i}>
                              {i}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Company Size */}
                      <div>
                        <label
                          htmlFor="reg-org-size"
                          className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5"
                        >
                          <HelpLabel
                            text="Company Size"
                            help={{ surface: "organization.registration", field: "size" }}
                          />{" "}
                          <span className="text-rose-500" aria-hidden="true">*</span>
                        </label>
                        <select
                          id="reg-org-size"
                          value={form.size}
                          onChange={(e) => handleFormChange("size", e.target.value)}
                          aria-required="true"
                          aria-invalid={attempted && Boolean(problems.size)}
                          className={inputClass("size")}
                        >
                          <option value="">Select size</option>
                          {availableSizes.map((s) => (
                            <option key={s} value={s}>
                              {s} employees
                            </option>
                          ))}
                        </select>
                        {attempted && problems.size && (
                          <p className="text-xs text-rose-600 mt-1" role="alert">
                            {problems.size}
                          </p>
                        )}
                        {selectedPlan && !problems.size && (
                          <p className="text-[11px] text-purple-600 font-medium mt-1">
                            {selectedPlan.name} covers {selectedLimits?.employees == null ? "any number of" : `up to ${selectedLimits.employees}`} employees.
                          </p>
                        )}
                      </div>

                      {/* Website */}
                      <div>
                        <label
                          htmlFor="reg-org-website"
                          className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5"
                        >
                          Website <span className="text-gray-400 font-normal lowercase ml-1">(optional)</span>
                        </label>
                        <input
                          id="reg-org-website"
                          type="text"
                          inputMode="url"
                          value={form.website}
                          onChange={(e) => handleFormChange("website", e.target.value)}
                          placeholder="company.com or https://company.com"
                          maxLength={255}
                          aria-invalid={attempted && Boolean(problems.website)}
                          className={inputClass("website")}
                        />
                        {attempted && problems.website && (
                          <p className="text-xs text-rose-600 mt-1" role="alert">
                            {problems.website}
                          </p>
                        )}
                      </div>

                      {/* Contact Number */}
                      <div>
                        <label
                          htmlFor="reg-org-phone_number"
                          className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5"
                        >
                          Contact Number <span className="text-gray-400 font-normal lowercase ml-1">(optional)</span>
                        </label>
                        <input
                          id="reg-org-phone_number"
                          type="tel"
                          value={form.phone_number}
                          onChange={(e) => handleFormChange("phone_number", e.target.value)}
                          placeholder="+91-XXXXXXXXXX"
                          maxLength={20}
                          aria-invalid={attempted && Boolean(problems.phone_number)}
                          className={inputClass("phone_number")}
                        />
                        {attempted && problems.phone_number && (
                          <p className="text-xs text-rose-600 mt-1" role="alert">
                            {problems.phone_number}
                          </p>
                        )}
                      </div>

                      {/* GST Number */}
                      <div>
                        <label
                          htmlFor="reg-org-gst_number"
                          className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5"
                        >
                          <HelpLabel
                            text="GST Number"
                            help={{ surface: "organization.registration", field: "gst_number" }}
                          />{" "}
                          <span className="text-gray-400 font-normal lowercase ml-1">(optional)</span>
                        </label>
                        <input
                          id="reg-org-gst_number"
                          type="text"
                          value={form.gst_number}
                          onChange={(e) => handleFormChange("gst_number", e.target.value)}
                          placeholder="22AAAAA0000A1Z5"
                          maxLength={50}
                          aria-invalid={attempted && Boolean(problems.gst_number)}
                          className={inputClass("gst_number")}
                        />
                        {attempted && problems.gst_number && (
                          <p className="text-xs text-rose-600 mt-1" role="alert">
                            {problems.gst_number}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Company PAN */}
                    <div>
                      <label
                        htmlFor="reg-org-company_pan_number"
                        className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5"
                      >
                        <HelpLabel
                          text="Company PAN"
                          help={{ surface: "organization.registration", field: "company_pan_number" }}
                        />{" "}
                        <span className="text-gray-400 font-normal lowercase ml-1">(optional)</span>
                      </label>
                      <input
                        id="reg-org-company_pan_number"
                        type="text"
                        value={form.company_pan_number}
                        onChange={(e) => handleFormChange("company_pan_number", e.target.value)}
                        placeholder="ABCDE1234F"
                        maxLength={50}
                        aria-invalid={attempted && Boolean(problems.company_pan_number)}
                        className={inputClass("company_pan_number")}
                      />
                      {attempted && problems.company_pan_number && (
                        <p className="text-xs text-rose-600 mt-1" role="alert">
                          {problems.company_pan_number}
                        </p>
                      )}
                    </div>

                    {error && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 flex items-center justify-between gap-3" role="alert">
                        <div className="flex items-center gap-2">
                          <HiExclamationCircle className="w-4 h-4 shrink-0 text-rose-500" />
                          <span>{error}</span>
                        </div>
                        {planSource !== "live" && (
                          <button
                            type="button"
                            onClick={() => {
                              reloadPlans();
                              changeStep(1);
                            }}
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50"
                          >
                            <HiRefresh className="w-3.5 h-3.5" /> Reload plans
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold text-sm rounded-xl py-3 transition-colors disabled:opacity-60 cursor-pointer shadow-sm shadow-purple-200 flex items-center justify-center gap-2 mt-2"
                    >
                      {loading ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                          Processing…
                        </>
                      ) : (
                        <>
                          {isFreePlan ? "Activate Workspace" : "Proceed to Payment"}
                          <HiArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                </>
              )}

            </div>
          )}

        </main>
      </div>
    </WorkspaceContext.Provider>
  );
}

export default RegisterOrgPage;
