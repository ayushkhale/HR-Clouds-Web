// ─────────────────────────────────────────────────────────────────────────────
// settings.api.js — The organisation settings gateway, Phase 1 (#242–#245).
//
// Contract: public/ref docs/md_settings/combined_api_analysis.md and
// phases/phase1_api_analysis.md.
//
// PHASE 1 IS READ-ONLY. There are four endpoints and all four are GETs: the
// catalogue (what settings EXIST and what they mean), and the read plane (what
// this organisation has them set to). The write plane — `PUT /settings/groups/
// :groupKey` and its reset — is Phase 2 and is NOT shipped, so there is
// deliberately no write function in this file. Don't add one speculatively;
// a Save button with nothing behind it is exactly the "button that 403s" §2
// forbids.
//
// Two planes, and the difference between them is the whole design:
//   · CATALOGUE (#242/#243) — the contract. 26 groups, ~137 settings, 49
//     policy surfaces, with labels, types, ranges, defaults, risk and effect
//     timing. No tenant values at all. Versioned by `catalog_version` and
//     cacheable, because it changes only when we release.
//   · VALUES (#244/#245) — this organisation's live numbers, sliced per group.
//
// Traps worth keeping:
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
};

export default settingsAPI;
