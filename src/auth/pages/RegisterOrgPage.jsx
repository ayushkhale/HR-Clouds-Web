import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { organizationAPI, tokenHelper } from "../../shared/api";
import { useAuth } from "../../shared/contexts/AuthContext";
import { HiCheck, HiArrowLeft, HiArrowRight, HiOfficeBuilding, HiExclamationCircle, HiRefresh } from "react-icons/hi";
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
import { ENV } from "../../config/env";

// Shared with Edit company details, so both offer the same industries.
const INDUSTRIES = INDUSTRY_OPTIONS;

const SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];

// A size bucket is offerable when its smallest team still fits the plan's seat
// limit. Derived from the catalog so a limit change can't leave a stale list
// that lets someone pick "201-500" on a 20-seat plan.
const bucketFloor = (bucket) => parseInt(bucket, 10) || 0;
const sizesForPlan = (plan) =>
  plan ? SIZES.filter((b) => bucketFloor(b) <= plan.limits.employees) : SIZES;

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
  const { login, getDashboardPath, role } = useAuth();

  // Step 1: select plan; Step 2: enter details
  const [step, setStep] = useState(1);
  const [billing, setBilling] = useState("monthly"); // monthly | yearly
  // The TIER, not the plan object. The catalogue arrives asynchronously, so
  // holding the object would pin a card to whichever list was loaded when it
  // was clicked — the fallback's figures surviving into a live session is
  // exactly the drift this screen must not have.
  const [selectedTier, setSelectedTier] = useState(null);

  // Form details
  const [form, setForm] = useState({
    org_name: "", org_alias: "", industry: "", size: "",
    website: "", phone_number: "", gst_number: "", company_pan_number: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Where the cards and the price come from. Everyone who reaches this page is
  // a signed-in guest (#2 needs a guest token), so this is normally the LIVE
  // catalogue; the hardcoded fallback appears only if that read failed, and
  // `planSource` is what stops us taking money on unverified figures below.
  const {
    plans, source: planSource, loading: plansLoading, error: plansError, reload: reloadPlans,
  } = usePlanCatalog();
  const planByTier = useMemo(() => Object.fromEntries(plans.map((p) => [p.tier, p])), [plans]);

  useEffect(() => { loadRazorpayScript(); }, []);

  // A pricing-page card links here as ?plan=starter&billing=yearly. Honour it
  // so the plan the buyer clicked is the plan they land on — picking again
  // from a second, identical list is how the two lists drifted apart before.
  //
  // The parked choice is READ once and HELD, rather than consumed on mount:
  // applying it needs the catalogue, which arrives a moment later, and
  // clearing the intent before it could be used would lose the click.
  const [parkedChoice] = useState(() => {
    const parked = readPlanIntent();
    // Query wins over the parked intent — it is the more recent click.
    const choice = {
      tier: searchParams.get("plan") || parked?.tier || null,
      cycle: searchParams.get("billing") || parked?.billing || null,
    };
    clearPlanIntent(); // honoured once; re-picking here must stick
    return choice;
  });

  useEffect(() => {
    if (parkedChoice.cycle === "yearly" || parkedChoice.cycle === "monthly") {
      setBilling(parkedChoice.cycle);
    }
  }, [parkedChoice]);

  // Apply the parked tier as soon as the catalogue that defines it is in. Once
  // only: a later edit in the picker must not be overwritten when the list
  // refreshes. A tier that no longer exists simply leaves them on the picker.
  const choiceApplied = useRef(false);
  useEffect(() => {
    if (choiceApplied.current || plansLoading || !parkedChoice.tier) return;
    choiceApplied.current = true;
    if (planByTier[parkedChoice.tier]) {
      setSelectedTier(parkedChoice.tier);
      setStep(2);
    }
  }, [parkedChoice, planByTier, plansLoading]);

  useEffect(() => {
    if (!tokenHelper.get()) {
      navigate("/auth/login", { replace: true });
      return;
    }
    // Only a guest (no org yet) may register a new organization. Anyone who
    // already belongs to an org is sent to their dashboard.
    if (role && role !== "guest") {
      navigate(getDashboardPath(), { replace: true });
    }
  }, [navigate, role, getDashboardPath]);

  // Always derived from the current catalogue, so a live list arriving after a
  // click silently corrects the card rather than leaving a stale one selected.
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

  // A size already chosen can stop fitting when the catalogue loads and the
  // real limit turns out to be lower. Drop it rather than submitting a bucket
  // the picker would no longer offer.
  useEffect(() => {
    if (form.size && !availableSizes.includes(form.size)) {
      setForm((prev) => ({ ...prev, size: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSizes.join("|")]);

  function handleFormChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedPlan) return;

    // Don't take money on figures we couldn't verify. Everyone here is signed
    // in, so a fallback catalogue means the #225 read failed — the price on
    // screen may not be the price the gateway asks for, and meeting a
    // different number in the payment window is the complaint this whole
    // module exists to prevent. A free plan is exempt: there is nothing to
    // get wrong.
    const planCode = planCodeFor(selectedPlan, billing);
    if (planSource !== "live" && !isFreePlan) {
      setError("We couldn’t confirm today’s prices just now. Reload the plans and try again — nothing has been charged.");
      return;
    }
    if (!planCode) {
      setError("That plan isn’t available any more. Pick another one.");
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

      // Paid plan Razorpay modal — persist org_id so a mid-payment reload can
      // still verify against the right organization.
      if (res.data?.razorpay_order) {
        if (res.data.org_id) {
          try { sessionStorage.setItem(PENDING_ORG_KEY, res.data.org_id); } catch { /* ignore */ }
        }
        await openRazorpay(res.data.razorpay_order, res.data.org_id);
      }
    } catch (err) {
      // §6: never a raw server sentence. A stale plan_code in the catalogue
      // surfaces here as PLAN_NOT_FOUND, which has to read as "pick another",
      // not as a backend error string.
      setError(organizationErrorMessage(err, "We couldn’t set up your organisation. Try again."));
    } finally {
      setLoading(false);
    }
  }

  async function openRazorpay(order, orgId) {
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setError("Failed to load payment gateway. Please refresh and try again.");
      return;
    }

    if (!ENV.RAZORPAY_KEY_ID) {
      setError("Payment gateway is temporarily unavailable (Key not configured). Please contact support.");
      return;
    }

    const options = {
      key: ENV.RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency || "INR",
      name: "HR Clouds",
      description: "Organization Subscription",
      order_id: order.id,
      handler: async function (paymentResponse) {
        setLoading(true);
        try {
          let resolvedOrgId = orgId;
          if (!resolvedOrgId) {
            try { resolvedOrgId = sessionStorage.getItem(PENDING_ORG_KEY); } catch { /* ignore */ }
          }
          const verifyRes = await organizationAPI.verifyPayment({
            razorpay_order_id: paymentResponse.razorpay_order_id,
            razorpay_payment_id: paymentResponse.razorpay_payment_id,
            razorpay_signature: paymentResponse.razorpay_signature,
            org_id: resolvedOrgId,
          });

          try { sessionStorage.removeItem(PENDING_ORG_KEY); } catch { /* ignore */ }
          login(verifyRes);
          setSuccess(true);
          setTimeout(() => navigate(getDashboardPath("hr"), { replace: true }), 1500);
        } catch (err) {
          // A verification that does not land is NOT a lost payment: the
          // gateway webhook and the reconciler settle the same transaction
          // within minutes (#239). Never tell them to pay again.
          setError(organizationErrorMessage(err, "We couldn’t confirm that payment yet. Don’t pay again — check your email, or contact support if your workspace isn’t ready shortly."));
        } finally {
          setLoading(false);
        }
      },
      prefill: {
        email: "",
        contact: form.phone_number,
      },
      theme: {
        color: "#7c3aed",
      },
      modal: {
        ondismiss: () => {
          setError("Payment was cancelled. You can retry anytime — your organization has been saved.");
          setLoading(false);
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  }

  // ─── Success Page ──────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4 font-sans">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-10 max-w-sm w-full text-center animate-fade-in">
          <div className="w-16 h-16 bg-violet-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <HiCheck className="w-8 h-8 text-violet-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome aboard! 🎉</h1>
          <p className="text-sm text-gray-500 mb-4">
            Your organization is active. Redirecting to your HR Dashboard…
          </p>
          <div className="flex justify-center">
            <svg className="w-5 h-5 animate-spin text-purple-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col justify-between font-sans">
      {/* Header */}
      <header className="border-b border-gray-100 px-6 sm:px-12 py-5 bg-white">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/">
            <img src={hrcloudsLogo} alt="HR Clouds" className="h-9 w-auto object-contain" />
          </Link>

          {step === 1 ? (
            <Link to="/dashboard/guest" className="text-xs font-semibold text-gray-500 hover:text-purple-600 transition-colors">
              ← Back to Dashboard
            </Link>
          ) : (
            <button
              onClick={() => setStep(1)}
              className="text-xs font-semibold text-gray-500 hover:text-purple-600 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <HiArrowLeft className="w-3.5 h-3.5" /> Change Selected Plan
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow flex items-center justify-center px-6 py-12">
        
        {/* STEP 1: Plan Selection */}
        {step === 1 && (
          <div className="max-w-5xl w-full mx-auto">
            <div className="text-center mb-10">
              <span className="inline-block mb-3 px-3 py-1 rounded-full bg-purple-50 border border-purple-100 text-purple-700 text-xs font-semibold">
                Step 1 of 2
              </span>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-2">
                Choose a Plan for Your{" "}
                <span className="bg-clip-text bg-gradient-to-t from-white to-purple-800 text-transparent">
                  Workspace
                </span>
              </h1>
              <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
                Select a plan scale. Upgrade or change your configuration anytime.
              </p>

              {/* Monthly/Yearly Toggle */}
              <div className="flex items-center justify-center gap-3 mt-6 bg-gray-100 rounded-xl p-1 w-max mx-auto text-xs font-medium">
                <button
                  onClick={() => setBilling("monthly")}
                  className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                    billing === "monthly"
                      ? "bg-white shadow-sm text-gray-900 font-semibold"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Monthly billing
                </button>
                <button
                  onClick={() => setBilling("yearly")}
                  className={`px-4 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                    billing === "yearly"
                      ? "bg-white shadow-sm text-gray-900 font-semibold"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Yearly billing
                  <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold">
                    Save {bestYearlySavingPct(plans)}%
                  </span>
                </button>
              </div>
            </div>

            {/* The catalogue couldn't be read. Say so before they choose,
                rather than letting them reach the payment window and meet a
                different number — the plans below are our last known list. */}
            {plansError && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50/70 px-4 py-3 mb-6 text-xs text-slate-700">
                <HiExclamationCircle className="w-4 h-4 shrink-0 text-fuchsia-500" />
                <span className="flex-1">
                  We couldn’t load today’s prices, so these are our last known ones. Reload before paying.
                </span>
                <button
                  type="button"
                  onClick={() => reloadPlans()}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  <HiRefresh className="w-3.5 h-3.5" /> Reload plans
                </button>
              </div>
            )}

            {/* The server offers nothing — a real state, not a failed read. */}
            {!plansLoading && !plansError && plans.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                There are no plans on sale at the moment. Contact support and we’ll set one up for you.
              </div>
            )}

            {/* Clean 3-Card Grid */}
            <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch ${plansLoading ? "opacity-60" : ""}`}>
              {plans.map((plan) => {
                const price = formatPlanPrice(plan, billing);
                const isFree = plan.monthly.amount === 0;
                return (
                  <div
                    key={plan.tier}
                    className={`bg-white rounded-2xl p-7 flex flex-col justify-between transition-all duration-200 relative
                      ${plan.popular
                        ? "border-2 border-purple-600 bg-purple-50/10 shadow-md shadow-purple-100"
                        : "border-2 border-gray-200 hover:border-purple-300 shadow-sm"
                      }`}
                  >
                    {plan.popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-purple-600 text-white text-[10px] font-bold tracking-wider rounded-full uppercase">
                        Most Popular
                      </span>
                    )}

                    <div>
                      <h3 className="font-bold text-lg text-gray-900 mb-1">{plan.name}</h3>
                      <p className="text-xs text-gray-500 mb-6">{plan.description}</p>

                      <div className="mb-1 flex items-baseline">
                        <span className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
                          {price}
                        </span>
                        {!isFree && (
                          <span className="text-xs text-gray-400 ml-1">
                            /{billing === "yearly" ? "year" : "month"}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 mb-6">
                        for the whole workspace
                      </p>

                      <ul className="space-y-2.5 mb-8">
                        {planBullets(plan).map((f) => (
                          <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
                            <HiCheck className="w-4 h-4 text-purple-600 flex-shrink-0" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedTier(plan.tier);
                        setStep(2);
                      }}
                      className={`w-full font-semibold text-sm rounded-xl py-3 text-center transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1.5
                        ${plan.popular
                          ? "bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white shadow-purple-200"
                          : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                        }`}
                    >
                      {isFree ? "Get Started Free" : "Select Plan"}
                      <HiArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: Configure Workspace details (Centered Form Layout) */}
        {step === 2 && (
          <div className="max-w-xl w-full mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm p-8 sm:p-10">
            <div className="text-left mb-6">
              <span className="inline-block mb-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-100 text-purple-700 text-xs font-semibold">
                Step 2 of 2
              </span>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">
                Organization Details
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Enter your company information to setup your workspace under the <span className="font-semibold text-purple-600">{selectedPlan?.name}</span>.
              </p>
            </div>

            {/* Selected Plan Summary Badge */}
            <div className="flex items-center gap-3 mb-6 p-3.5 bg-purple-50/50 border border-purple-100 rounded-xl">
              <div className="w-9 h-9 bg-purple-600 rounded-lg flex items-center justify-center text-white flex-shrink-0">
                <HiOfficeBuilding className="w-5 h-5" />
              </div>
              <div className="flex-grow">
                <p className="text-xs font-bold text-gray-900">
                  {selectedPlan?.name} ({billing})
                </p>
                <p className="text-[11px] text-gray-500">
                  {/* `monthlyPrice` / `yearlyPrice` were never fields on a plan,
                      so this line rendered "₹undefined/month" for every plan.
                      The catalogue's own formatters are the only way to print
                      a price. */}
                  {isFreePlan
                    ? "Free forever"
                    : [formatPlanPrice(selectedPlan, billing), planPeriodLabel(selectedPlan, billing)].filter(Boolean).join(" ")}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Organization / Company Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.org_name}
                  onChange={(e) => handleFormChange("org_name", e.target.value)}
                  placeholder="e.g. Acme Corp"
                  required
                  minLength={2}
                  maxLength={150}
                  className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                    Alias / Short Name <span className="text-gray-400 font-normal lowercase ml-1">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.org_alias}
                    onChange={(e) => handleFormChange("org_alias", e.target.value)}
                    placeholder="e.g. Acme"
                    maxLength={50}
                    className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                    Industry <span className="text-gray-400 font-normal lowercase ml-1">(optional)</span>
                  </label>
                  <select
                    value={form.industry}
                    onChange={(e) => handleFormChange("industry", e.target.value)}
                    className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all bg-white"
                  >
                    <option value="">Select industry</option>
                    {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                    Company Size <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={form.size}
                    onChange={(e) => handleFormChange("size", e.target.value)}
                    required
                    className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all bg-white"
                  >
                    <option value="">Select size</option>
                    {availableSizes.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {selectedPlan && (
                    <p className="text-[11px] text-purple-600 font-medium mt-1">
                      {selectedPlan.name} covers {selectedLimits?.employees == null ? "any number of" : `up to ${selectedLimits.employees}`} employees.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                    Website <span className="text-gray-400 font-normal lowercase ml-1">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={form.website}
                    onChange={(e) => handleFormChange("website", e.target.value)}
                    placeholder="https://company.com"
                    className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                    Contact Number <span className="text-gray-400 font-normal lowercase ml-1">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={form.phone_number}
                    onChange={(e) => handleFormChange("phone_number", e.target.value)}
                    placeholder="+91-XXXXXXXXXX"
                    className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                    GST Number <span className="text-gray-400 font-normal lowercase ml-1">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.gst_number}
                    onChange={(e) => handleFormChange("gst_number", e.target.value)}
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={50}
                    className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Company PAN <span className="text-gray-400 font-normal lowercase ml-1">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.company_pan_number}
                  onChange={(e) => handleFormChange("company_pan_number", e.target.value)}
                  placeholder="ABCDE1234F"
                  maxLength={50}
                  className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all bg-white"
                />
              </div>

              {error && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !form.org_name}
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
          </div>
        )}

      </main>

    </div>
  );
}

export default RegisterOrgPage;
