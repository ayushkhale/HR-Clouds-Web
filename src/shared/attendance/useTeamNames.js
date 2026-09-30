// ─────────────────────────────────────────────────────────────────────────────
// attendance/useTeamNames.js — user_id → name lookup for manager screens.
// Some manager endpoints return only `user_id` (e.g. team anomalies), and a
// UUID must never reach the screen.
//
// Names come from the app-wide employee directory, which the server already
// scopes to a manager's own reports — so this costs no request of its own and
// answers with exactly the names every other screen shows. Only when a manager
// can't read that roster does it fall back to the team-today list, which names
// the same people but carries nothing else.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useEmployeeDirectory } from "../contexts/EmployeeDirectoryContext";
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
  const { byId, status } = useEmployeeDirectory();
  const [fallback, setFallback] = useState(() => (cache.key === sessionKey() && cache.map) || {});

  // Only when the roster itself is out of reach — otherwise this endpoint is
  // one more request for names we already have.
  const needFallback = status === "unavailable" || status === "error";
  useEffect(() => {
    if (!needFallback) return undefined;
    let alive = true;
    loadTeamNames().then((m) => alive && setFallback(m));
    return () => { alive = false; };
  }, [needFallback]);

  return useMemo(() => {
    if (!byId.size) return fallback;
    const map = {};
    byId.forEach((entry, id) => { map[id] = { name: entry.name, code: entry.code }; });
    return map;
  }, [byId, fallback]);
}

/** `{ name, code }` for an attendance item, falling back to the team lookup. */
export function resolvePerson(item, names = {}) {
  const direct = personName(item, "");
  if (direct) return { name: direct, code: employeeCode(item) };
  const id = item?.user_id || item?.user?.id;
  return (id && names[id]) || { name: "Team member", code: "" };
}
