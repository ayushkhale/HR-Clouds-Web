// ─────────────────────────────────────────────────────────────────────────────
// settings.api.js — The organisation settings gateway (#242–#247).
//
// Contract: public/ref docs/md_settings/combined_api_analysis.md, with
// phases/phase1_api_analysis.md (reads) and phase2_api_analysis.md (writes).
//
// Two planes for reading, plus the write plane (Phase 2, #246–#247):
//   · CATALOGUE (#242/#243) — the contract. 26 groups, ~137 settings, 49
//     policy surfaces, with labels, types, ranges, defaults, risk and effect
//     timing. No tenant values at all. Versioned by `catalog_version` and
//     cacheable, because it changes only when we release.
//   · VALUES (#244/#245) — this organisation's live numbers, sliced per group.
//
// Traps worth keeping:
//   · Every write needs an `If-Match`, and it must be the PER-GROUP ETag.
//     #244's top-level ETag folds in the newest `updated_at` across all five
//     stores, so it is never a valid precondition for one group.
//   · A write is CONDITIONAL, not idempotent. Replaying one after a timeout
//     can clobber a newer value, which is why a 412 means re-read and
//     reconcile — never retry the same body.
//   · `module` and `group` on #242 are MUTUALLY EXCLUSIVE (422
//     INVALID_FILTER_COMBINATION). `qs()` would happily send both, so the
//     helper below refuses rather than letting the server scold us.
//   · Unknown query parameters are rejected outright (400 VALIDATION_ERROR) —
//     the validator is `unknown(false)`. Pass nothing we don't mean.
//   · #244 takes `modules` as ONE COMMA-SEPARATED STRING, not a repeated
//     param: `?modules=payroll,document`. A repeated param is parameter
//     pollution and fails. This is the opposite of every other array filter in
//     this codebase, which is why it is built here rather than left to callers.
//   · #244 DEGRADES: a group that can't be read comes back in
//     `unavailable_groups[]` with a reason, and the request still answers 200.
//     #245 FAILS LOUDLY on the same conditions (403). Same facts, two
//     behaviours — the hub uses #244 precisely because one broken store must
//     not blank the page.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";

const seg = (value) => encodeURIComponent(String(value ?? ""));

/** Only the keys we mean, and never the pair the server refuses together. */
function catalogQuery({ module: moduleKey, group, includeHidden } = {}) {
  if (moduleKey && group) {
    // The server answers 422 INVALID_FILTER_COMBINATION. Failing here instead
    // makes it a programming error at the call site, where it belongs.
    throw new Error("settings catalog: `module` and `group` are mutually exclusive");
  }
  const search = new URLSearchParams();
  if (moduleKey) search.append("module", moduleKey);
  if (group) search.append("group", group);
  // Only sent when true: the validator rejects unknown keys, and `false` is
  // the default anyway.
  if (includeHidden) search.append("include_hidden", "true");
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const settingsAPI = {
  // ───────────────────────────────────────────────────────────────────────────
  //  THE CATALOGUE — what settings exist, and what they mean
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * #242 GET /settings/catalog — the whole contract, no tenant values.
   *
   * @param {{ module?: string, group?: string, includeHidden?: boolean }} [filters]
   *   `module` is one of payroll | document | organization | leave | attendance.
   *   `module` and `group` cannot both be given.
   * @returns `{ catalog_version, generated_at, groups[], settings[], surfaces[], counts }`
   *   `groups[]` carries `readable` / `writable` / `entitled` already projected
   *   for the caller's role and plan, so the UI never decides those itself.
   */
  getCatalog(filters) {
    return request(`/settings/catalog${catalogQuery(filters)}`);
  },

  /**
   * #243 GET /settings/catalog/:settingKey — one setting's full definition.
   * Answers 404 SETTING_NOT_FOUND for a key that isn't in the catalogue.
   */
  getCatalogEntry(settingKey) {
    return request(`/settings/catalog/${seg(settingKey)}`);
  },

  // ───────────────────────────────────────────────────────────────────────────
  //  THE READ PLANE — what this organisation has them set to
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * #244 GET /settings — every readable group's live values in one read.
   *
   * @param {string[]|string} [modules] restrict to these modules. Sent as ONE
   *   comma-separated value (`payroll,document`), because a repeated parameter
   *   is treated as pollution and refused.
   * @returns `{ catalog_version, org_id, groups[], unavailable_groups[], etag, meta }`
   *   Each group carries `values`, `non_default_keys`, `updated_at` and its own
   *   `etag`. A group that could not be served is in `unavailable_groups[]`
   *   with `reason`: NOT_READABLE | NOT_ENTITLED | READ_FAILED — the request
   *   still succeeds, which is what keeps one failing store off the whole page.
   */
  getSettings(modules) {
    const list = Array.isArray(modules) ? modules.filter(Boolean) : modules;
    const value = Array.isArray(list) ? list.join(",") : list;
    return request(`/settings${value ? `?modules=${encodeURIComponent(value)}` : ""}`);
  },

  /**
   * #245 GET /settings/groups/:groupKey — one group's values WITH each
   * setting's catalogue metadata attached.
   *
   * Unlike #244 this fails loudly: a group the role can't read is 403
   * FORBIDDEN, one the plan doesn't cover is 403 FEATURE_NOT_AVAILABLE, and a
   * store error propagates. Use it when the person asked for this group
   * specifically — then a refusal is an answer, not a blank space.
   */
  getGroup(groupKey) {
    return request(`/settings/groups/${seg(groupKey)}`);
  },

  // ───────────────────────────────────────────────────────────────────────────
  //  THE WRITE PLANE (Phase 2, #246–#247) — HR only
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * #246 PUT /settings/groups/:groupKey — change one or more settings in ONE
   * group, under optimistic concurrency.
   *
   * `etag` is REQUIRED and must be the PER-GROUP weak ETag from #244/#245
   * (`group.etag`) or from a previous write's reply. Never the top-level ETag
   * of #244: that one folds in the newest `updated_at` across all five stores,
   * so it is not a valid precondition for any single group and the server
   * rejects it. A stale one answers 412 with the current token in `details`.
   *
   * One group per request by design (decision D-S4: one request, one group,
   * one transaction) — the gateway holds no transaction of its own and hands
   * the write to the owning module under its row lock.
   *
   * @param {string} groupKey
   * @param {{ values: object, reason?: string, confirm?: boolean }} patch
   *   `values` carries ONLY the keys being changed; `reason` and `confirm` are
   *   required together for anything the catalogue marks `risk: "high"`.
   * @param {string} etag the group's current ETag, sent as `If-Match`
   * @returns `{ catalog_version, group, store, etag, updated_at, values,
   *   changed: { key: { from, to } }, unchanged_keys, non_default_keys, impact? }`
   *   The new `etag` is adopted directly — a successful write needs no re-read.
   */
  updateGroup(groupKey, { values, reason, confirm } = {}, etag) {
    return request(`/settings/groups/${seg(groupKey)}`, {
      method: "PUT",
      headers: { "If-Match": etag },
      body: JSON.stringify({
        values,
        // The envelope is `.unknown(false)`: sending `reason: undefined` is
        // fine, but sending an empty string where none is needed is a
        // validation error waiting to happen. Omit what we don't mean.
        ...(reason ? { reason } : {}),
        ...(confirm ? { confirm: true } : {}),
      }),
    });
  },

  /**
   * #247 POST /settings/groups/:groupKey/reset — put named keys back to their
   * catalogue defaults.
   *
   * Not a privileged shortcut: it runs the identical pipeline as #246, so the
   * same `If-Match`, the same reason and confirmation gates, and the same
   * allowlist apply. A key the catalogue marks `resettable: false` is refused
   * with 422 SETTING_NOT_RESETTABLE.
   *
   * @param {string} groupKey
   * @param {{ keys: string[], reason?: string, confirm?: boolean }} payload
   * @param {string} etag the group's current ETag, sent as `If-Match`
   */
  resetGroup(groupKey, { keys, reason, confirm } = {}, etag) {
    return request(`/settings/groups/${seg(groupKey)}/reset`, {
      method: "POST",
      headers: { "If-Match": etag },
      body: JSON.stringify({
        keys,
        ...(reason ? { reason } : {}),
        ...(confirm ? { confirm: true } : {}),
      }),
    });
  },
};

export default settingsAPI;
