// ─────────────────────────────────────────────────────────────────────────────
// attendance/useTeamNames.js — user_id → name lookup for manager screens.
// Some manager endpoints return only `user_id` (e.g. team anomalies). Names are
// resolved from the hierarchy-scoped team-today list so no out-of-scope data
// is requested and a UUID is never shown.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { attendanceAPI, tokenHelper } from "../api";
import { employeeCode, listFrom, personName } from "./normalize.js";

const CACHE_MS = 60_000;
// Keyed by session token so another user's team never leaks after re-login.
let cache = { key: null, at: 0, map: null, promise: null };
const sessionKey = () => tokenHelper.get() || "";

function loadTeamNames() {
  const key = sessionKey();
  if (cache.key !== key) cache = { key, at: 0, map: null, promise: null };
  if (cache.map && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.map);
  if (cache.promise) return cache.promise;
  const promise = attendanceAPI
    .getManagerTeamToday()
    .then((res) => {
      const map = {};
      listFrom(res, ["team", "members", "records"]).forEach((row) => {
        const id = row.user_id || row.user?.id;
        const name = personName(row, "");
        if (id && name) map[id] = { name, code: employeeCode(row) };
      });
      if (cache.key === key) cache = { key, at: Date.now(), map, promise: null };
      return map;
    })
    .catch(() => {
      if (cache.key === key) cache.promise = null;
      return {};
    });
  cache.promise = promise;
  return promise;
}

export function useTeamNames() {
  const [map, setMap] = useState(() => (cache.key === sessionKey() && cache.map) || {});
  useEffect(() => {
    let alive = true;
    loadTeamNames().then((m) => alive && setMap(m));
    return () => {
      alive = false;
    };
  }, []);
  return map;
}

/** `{ name, code }` for an attendance item, falling back to the team lookup. */
export function resolvePerson(item, names = {}) {
  const direct = personName(item, "");
  if (direct) return { name: direct, code: employeeCode(item) };
  const id = item?.user_id || item?.user?.id;
  return (id && names[id]) || { name: "Team member", code: "" };
}
