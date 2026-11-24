import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { billingAPI } from "../api/billing.api";
import { useAuth } from "./AuthContext";
import { PLAN_EXPIRED_EVENT } from "../api/client";
import { isSubscriptionLapsed } from "../utils/organizationErrors";

const SubscriptionContext = createContext({
  subscription: null,
  loading: false,
  error: null,
  isExpired: false,
  isDue: false,
  daysRemaining: null,
  plan: null,
  isModalDismissed: false,
  dismissModal: () => {},
  refreshSubscription: () => {},
});

export function SubscriptionProvider({ children }) {
  const { isAuthenticated, role, orgId } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [eventTriggeredExpired, setEventTriggeredExpired] = useState(false);
  const [isModalDismissed, setIsModalDismissed] = useState(false);

  const fetchSubscription = useCallback(async () => {
    if (!isAuthenticated || !orgId || role === "guest") {
      setSubscription(null);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const res = await billingAPI.getSubscription();
      const sub = res?.data?.subscription || res?.subscription || null;
      setSubscription(sub);
      setError(null);
    } catch (err) {
      setError(err);
      if (isSubscriptionLapsed(err)) {
        setEventTriggeredExpired(true);
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, orgId, role]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Reactive subscription expiration from HTTP 402 or explicit error codes on ANY api call
  useEffect(() => {
    const handlePlanExpired = () => {
      setEventTriggeredExpired(true);
    };

    window.addEventListener(PLAN_EXPIRED_EVENT, handlePlanExpired);
    return () => {
      window.removeEventListener(PLAN_EXPIRED_EVENT, handlePlanExpired);
    };
  }, []);

  // Developer / QA preview helper: allows testing with ?plan_expired=true in URL or localStorage
  const isDevExpired = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("plan_expired") === "true") return true;
      if (localStorage.getItem("hrclouds_mock_plan_expired") === "true") return true;
    } catch {
      // ignore
    }
    return false;
  }, []);

  const status = subscription?.status;
  const daysRemaining = subscription?.days_remaining != null ? Number(subscription.days_remaining) : null;

  const isExplicitlyExpired =
    status === "expired" ||
    status === "suspended" ||
    (status === "past_due" && daysRemaining !== null && daysRemaining <= 0);

  const isLapsed = isSubscriptionLapsed(error);
  const isExpired = Boolean(isDevExpired || isExplicitlyExpired || isLapsed || eventTriggeredExpired);

  const isDue = Boolean(
    (daysRemaining !== null && daysRemaining <= 7) ||
    status === "in_grace" ||
    status === "past_due"
  );

  const dismissModal = useCallback(() => {
    setIsModalDismissed(true);
  }, []);

  const value = useMemo(
    () => ({
      subscription,
      loading,
      error,
      isExpired,
      isDue,
      daysRemaining,
      plan: subscription?.plan || null,
      isModalDismissed,
      dismissModal,
      refreshSubscription: fetchSubscription,
    }),
    [subscription, loading, error, isExpired, isDue, daysRemaining, isModalDismissed, dismissModal, fetchSubscription]
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
