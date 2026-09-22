import React, { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { organizationAPI, tokenHelper } from "../../shared/api";
import { useAuth } from "../../shared/contexts/AuthContext";
import { HiCheck, HiArrowLeft, HiArrowRight, HiOfficeBuilding } from "react-icons/hi";
import hrcloudsLogo from "../../assets/logo2.png";
import {
  PLANS,
  PLAN_BY_TIER,
  planCodeFor,
  formatPlanPrice,
  planBullets,
  bestYearlySavingPct,
} from "../../shared/config/plans";
import { readPlanIntent, clearPlanIntent } from "../../shared/config/planIntent";

const INDUSTRIES = [
  "Software Development", "IT Services", "E-Commerce", "Healthcare",
  "Education", "Manufacturing", "Finance", "Retail", "Hospitality", "Other",
];

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
  const [selectedPlan, setSelectedPlan] = useState(null);

  // Form details
  const [form, setForm] = useState({
    org_name: "", org_alias: "", industry: "", size: "",
    website: "", phone_number: "", gst_number: "", company_pan_number: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => { loadRazorpayScript(); }, []);

  // A pricing-page card links here as ?plan=starter&billing=yearly. Honour it
  // so the plan the buyer clicked is the plan they land on — picking again
  // from a second, identical list is how the two lists drifted apart before.
  useEffect(() => {
    // Either the query string (already signed in, straight from a card) or the
    // intent parked before the signup detour. Query wins — it is the more
    // recent click.
    const parked = readPlanIntent();
    const tier = searchParams.get("plan") || parked?.tier;
    const cycle = searchParams.get("billing") || parked?.billing;

    if (cycle === "yearly" || cycle === "monthly") setBilling(cycle);
    const preset = tier && PLAN_BY_TIER[tier];
    if (preset) {
      setSelectedPlan(preset);
      setStep(2);
    }
    clearPlanIntent(); // honoured once; re-picking here must stick

    // Read once on entry — later edits to the picker must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    if (selectedPlan?.tier === "free") {
      setForm((prev) => ({ ...prev, size: "1-10" }));
    }
  }, [selectedPlan]);

  const availableSizes = sizesForPlan(selectedPlan);

  function handleFormChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedPlan) return;

    setError("");
    setLoading(true);

    const planCode = planCodeFor(selectedPlan, billing);

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
      setError(err.message || "Registration failed. Please try again.");
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

    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
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
          setError(err.message || "Payment verification failed. Please contact support.");
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
                    Save {bestYearlySavingPct()}%
                  </span>
                </button>
              </div>
            </div>

            {/* Clean 3-Card Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              {PLANS.map((plan) => {
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
                        setSelectedPlan(plan);
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
                  {selectedPlan?.monthlyPrice === 0
                    ? "Free forever"
                    : `₹${(billing === "yearly" ? selectedPlan?.yearlyPrice : selectedPlan?.monthlyPrice)?.toLocaleString("en-IN")}/${billing === "yearly" ? "year" : "month"}`}
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
                      {selectedPlan.name} covers up to {selectedPlan.limits.employees} employees.
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
                    {selectedPlan?.monthlyPrice === 0 ? "Activate Workspace" : "Proceed to Payment"}
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
