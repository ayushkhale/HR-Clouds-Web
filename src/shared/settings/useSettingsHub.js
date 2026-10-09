// ─────────────────────────────────────────────────────────────────────────────
// useSettingsHub.js — Loads the settings hub: the catalogue and this
// organisation's values, merged into something a screen can render.
//
// Contract: #242 and #244 (public/ref docs/md_settings/combined_api_analysis.md).
//
// Two reads, fired together, because they answer different questions and
// neither is useful alone:
//   · #242 the CATALOGUE — what each setting IS: its label, type, unit,
//     default, risk, and when a change would take effect. Same for every
//     tenant, versioned by release.
//   · #244 the VALUES — what THIS organisation has them set to, sliced per
//     group, with `non_default_keys` already computed server-side.
//
// The merge is deliberately one-directional: the catalogue decides which
// settings exist and in what order, and the values read only supplies numbers.
// A value for a setting the catalogue doesn't describe is dropped rather than
// rendered as a bare key — §4 forbids a raw column name on screen, and a key
// with no label is exactly that.
//
// Why the catalogue failing is fatal but values failing is not:
// without the catalogue there are no labels, types or units, so every row
// would be a raw key — there is nothing honest to draw. Without values there
// is still the full list of settings and what they mean, which is most of what
// a discovery screen is for, so the page renders and each card says it
// couldn't read the current numbers. #244 itself already degrades per group
// (`unavailable_groups[]`), and those are states, not failures — see
// settingsErrors.UNAVAILABLE_REASON.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { settingsAPI } from "../api";
import { settingsErrorMessage } from "../utils/settingsErrors";

export default function useSettingsHub() {
  const [state, setState] = useState({
    catalog: null,
    values: null,
    loading: true,
    error: null,       // fatal: the catalogue didn't load
    valuesError: null, // partial: the page works, the numbers are missing
  });

  const load = useCallback(async ({ signal } = {}) => {
    setState((s) => ({ ...s, loading: true, error: null, valuesError: null }));

    // Settled, not all: a failed values read must not take the catalogue down
    // with it, and the page is worth rendering on the catalogue alone.
    const [catalogRes, valuesRes] = await Promise.allSettled([
      settingsAPI.getCatalog(),
      settingsAPI.getSettings(),
    ]);
    if (signal?.aborted) return;

    if (catalogRes.status === "rejected") {
      setState({
        catalog: null, values: null, loading: false,
        error: settingsErrorMessage(catalogRes.reason, "We couldn’t load your settings. Try again."),
        valuesError: null,
      });
      return;
    }

    setState({
      catalog: catalogRes.value?.data || null,
      values: valuesRes.status === "fulfilled" ? valuesRes.value?.data || null : null,
      loading: false,
      error: null,
      valuesError: valuesRes.status === "rejected"
        ? settingsErrorMessage(valuesRes.reason, "We couldn’t read what these are currently set to.")
        : null,
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  /* ─── The merge ─────────────────────────────────────────────────────────
     Shapes the two payloads into what the cards actually consume, once,
     rather than making every card re-derive it. */
  const model = useMemo(() => {
    const catalog = state.catalog;
    if (!catalog) {
      return { groups: [], entriesByGroup: {}, groupsByKey: {}, entries: [], surfacesByModule: {}, unavailable: [], modules: [] };
    }

    const catalogGroups = catalog.groups || [];
    const entries = catalog.settings || [];

    // Live values, by group key.
    const liveByKey = Object.fromEntries((state.values?.groups || []).map((g) => [g.key, g]));
    const unavailable = state.values?.unavailable_groups || [];
    const unavailableByKey = Object.fromEntries(unavailable.map((u) => [u.key, u.reason]));

    // Catalogue order is the display order; the catalogue sends `order`, and
    // ties fall back to the label so the list can never shuffle between loads.
    const groups = [...catalogGroups]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.label).localeCompare(String(b.label)))
      .map((group) => {
        const live = liveByKey[group.key] || null;
        return {
          ...group,
          values: live?.values || null,
          nonDefaultKeys: live?.non_default_keys || [],
          updatedAt: live?.updated_at || null,
          // The precondition for writing this group (#246/#247 `If-Match`).
          // Per-group, never the response's top-level ETag.
          etag: live?.etag || null,
          // Why this group has no numbers, if it has none. A group absent from
          // BOTH lists simply wasn't read (e.g. the values call failed whole).
          unavailableReason: live ? null : unavailableByKey[group.key] || null,
          hasValues: Boolean(live),
        };
      });

    const entriesByGroup = {};
    for (const entry of entries) {
      (entriesByGroup[entry.group_key] ||= []).push(entry);
    }

    const surfacesByModule = {};
    for (const surface of catalog.surfaces || []) {
      (surfacesByModule[surface.module_key] ||= []).push(surface);
    }

    const groupsByKey = Object.fromEntries(groups.map((g) => [g.key, g]));

    // Every module that has something to show — a group or a policy surface.
    const modules = [...new Set([
      ...groups.map((g) => g.module_key),
      ...Object.keys(surfacesByModule),
    ])].filter(Boolean);

    return { groups, entriesByGroup, groupsByKey, entries, surfacesByModule, unavailable, modules };
  }, [state.catalog, state.values]);

  /**
   * Fold a successful write (#246/#247) back into the loaded values, without
   * re-reading anything. The reply carries the group's new `values`, its new
   * `etag` and a freshly computed `non_default_keys`, which is everything
   * this screen displays — so a re-read would cost a round trip to learn what
   * we were just told.
   */
  const applyWrite = useCallback((groupKey, result) => {
    if (!result) return;
    setState((s) => {
      if (!s.values) return s;
      const groups = (s.values.groups || []).map((g) => (
        g.key === groupKey
          ? {
            ...g,
            values: result.values ?? g.values,
            non_default_keys: result.non_default_keys ?? g.non_default_keys,
            updated_at: result.updated_at ?? g.updated_at,
            etag: result.etag ?? g.etag,
          }
          : g
      ));
      return { ...s, values: { ...s.values, groups } };
    });
  }, []);

  return {
    ...state,
    ...model,
    catalogVersion: state.catalog?.catalog_version || null,
    reload: load,
    applyWrite,
  };
}
