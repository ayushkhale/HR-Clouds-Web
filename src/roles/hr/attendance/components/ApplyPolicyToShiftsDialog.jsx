// ─────────────────────────────────────────────────────────────────────────────
// ApplyPolicyToShiftsDialog — Setup › Attendance Policies: choose which shifts
// follow a policy. There is no "assign an attendance policy to a person"
// endpoint: the chain is policy → shift → shift assignment, so a policy
// reaches people through the shift they work. This dialog is that link, made
// from the policy's side (Work Shifts makes it from the shift's side).
//
// It is deliberately NOT the person-picker shape of the shift and leave assign
// forms — HR is choosing shifts here, so it is a tick-list of shifts showing
// what each follows today. Ticked → linked to this policy; unticked (where it
// was linked) → back to the default policy (policy_id null).
//
// Contract trap: PUT /attendance/hr/shifts/:id needs `name`, and nothing
// documents a partial update as safe. Each changed shift is therefore read
// fresh and re-sent through shiftPolicyPayload (validateShift, the Edit Shift
// form's own builder) with only the policy changed. Writes go a few at a time
// (settleWithLimit, CLAUDE.md §7); a shift that fails is named, never hidden.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { HiX, HiClock, HiCheck } from "react-icons/hi";
import { attendanceAPI } from "../../../../shared/api";
import { attendanceErrorMessage } from "../../../../shared/utils/attendanceErrors";
import { listFrom, unwrap } from "../../../../shared/attendance/normalize";
import { emitAttendanceChanged, ATTENDANCE_EVENTS } from "../../../../shared/attendance/events";
import { InlineAlert, Spinner } from "../../../../shared/attendance/ui";
import { settleWithLimit } from "../../../../shared/utils/promisePool";
import { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";
import { shiftHours, shiftPolicyId, shiftPolicyPayload, shiftType } from "../shiftMeta";

export default function ApplyPolicyToShiftsDialog({ policy, policies = [], onClose, onSaved }) {
  const [shifts, setShifts] = useState({ rows: [], loading: true, error: null });
  const [ticked, setTicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState([]);

  useEffect(() => {
    let alive = true;
    attendanceAPI.getShifts({ is_active: true })
      .then((res) => {
        if (!alive) return;
        const rows = listFrom(res, ["shifts"]).filter((s) => s.is_active !== false);
        setShifts({ rows, loading: false, error: null });
        setTicked(new Set(rows.filter((s) => shiftPolicyId(s) === policy.id).map((s) => s.id)));
      })
      .catch((error) => alive && setShifts({ rows: [], loading: false, error }));
    return () => { alive = false; };
  }, [policy.id]);

  const policyName = useMemo(() => {
    const byId = Object.fromEntries(policies.map((p) => [p.id, p.name]));
    const fallback = policies.find((p) => p.is_default)?.name;
    return (s) => {
      const id = shiftPolicyId(s);
      if (!id) return fallback ? `${fallback} (default)` : "Default policy";
      return byId[id] || "Another policy";
    };
  }, [policies]);

  // What saving would change, so the button can say it and nothing is re-sent.
  const changes = useMemo(() => shifts.rows.filter((s) => {
    const linked = shiftPolicyId(s) === policy.id;
    return ticked.has(s.id) !== linked;
  }), [shifts.rows, ticked, policy.id]);

  const toggle = (id) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  async function save() {
    if (busy || changes.length === 0) return;
    setBusy(true);
    setFailures([]);
    const failed = [];
    await settleWithLimit(
      changes,
      async (s) => {
        const fresh = unwrap(await attendanceAPI.getShift(s.id)) || s;
        if (fresh.is_active === false) throw new Error("It was deactivated, so it can’t be changed.");
        const target = ticked.has(s.id) ? policy.id : "";
        const { errors, payload } = shiftPolicyPayload(fresh, target);
        if (Object.keys(errors).length) throw new Error("Its working hours need fixing in Work Shifts first.");
        await attendanceAPI.updateShift(s.id, payload);
      },
      {
        concurrency: 3,
        onSettled: (index, result) => {
          if (result.status === "rejected") {
            failed.push({ name: changes[index].name, message: attendanceErrorMessage(result.reason, result.reason?.message || "Couldn’t update it.") });
          }
        },
      },
    );
    setBusy(false);
    const done = changes.length - failed.length;
    if (done > 0) emitAttendanceChanged(ATTENDANCE_EVENTS.CONFIG, { entity: "shift" });
    if (failed.length) {
      setFailures(failed);
      // Re-read so the ticks show what actually happened.
      try {
        const rows = listFrom(await attendanceAPI.getShifts({ is_active: true }), ["shifts"]).filter((s) => s.is_active !== false);
        setShifts({ rows, loading: false, error: null });
        setTicked(new Set(rows.filter((s) => shiftPolicyId(s) === policy.id).map((s) => s.id)));
      } catch { /* keep the list as it is */ }
      return;
    }
    onSaved(`${policy.name} now applies to ${ticked.size} shift${ticked.size === 1 ? "" : "s"}.`);
  }

  const linkedCount = ticked.size;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="apply-policy-title">
        <div className="flex items-start justify-between gap-4 px-6 sm:px-8 py-6 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h2 id="apply-policy-title" className="text-lg font-bold text-slate-800">Apply {policy.name} to shifts</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              A policy reaches people through their shift: everyone working a ticked shift is judged by these rules. Unticked shifts follow the default policy.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition shrink-0" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 py-6 space-y-4">
          {failures.length > 0 && (
            <InlineAlert tone="rose">
              <p className="font-bold">Some shifts weren’t changed:</p>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">
                {failures.map((f) => <li key={f.name}><span className="font-semibold">{f.name}</span>: {f.message}</li>)}
              </ul>
            </InlineAlert>
          )}

          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <HelpLabel text="Active shifts" help={{ surface: "attendance.shift_setup", field: "policy_id", size: "sm" }} />
            </p>
            {!shifts.loading && !shifts.error && shifts.rows.length > 0 && (
              <p className="text-xs text-slate-400">{linkedCount} of {shifts.rows.length} ticked</p>
            )}
          </div>

          {shifts.loading ? (
            <p className="text-xs text-slate-400 flex items-center gap-2 py-6"><Spinner className="w-3.5 h-3.5 text-purple-600" /> Loading shifts…</p>
          ) : shifts.error ? (
            <InlineAlert tone="rose">{attendanceErrorMessage(shifts.error, "Couldn’t load shifts.")}</InlineAlert>
          ) : shifts.rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center">
              <HiClock className="w-8 h-8 mx-auto text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-600">No active shifts yet</p>
              <p className="text-xs text-slate-400">Create a shift under Work Shifts, then come back to apply this policy.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {shifts.rows.map((s) => {
                const on = ticked.has(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => toggle(s.id)}
                      disabled={busy}
                      aria-pressed={on}
                      className={`w-full text-left rounded-xl border-2 px-4 py-3 flex items-start gap-3 transition disabled:opacity-60 ${on ? "border-purple-500 bg-purple-50" : "border-slate-200 hover:border-slate-300 bg-white"}`}
                    >
                      <span className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? "bg-purple-600 border-purple-600 text-white" : "border-slate-300 bg-white"}`}>
                        {on && <HiCheck className="w-3.5 h-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-sm font-bold truncate ${on ? "text-purple-800" : "text-slate-800"}`}>{s.name}</span>
                        <span className="block text-[11px] text-slate-500 capitalize">{shiftHours(s) || "No set hours"} · {shiftType(s)}</span>
                        <span className="block text-[11px] text-slate-400 mt-0.5">Today: {shiftPolicyId(s) === policy.id ? "this policy" : policyName(s)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-3 px-6 sm:px-8 py-5 border-t border-slate-100">
          <button type="button" onClick={onClose} disabled={busy} className="px-8 py-3 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50">
            {failures.length ? "Close" : "Cancel"}
          </button>
          <button type="button" onClick={save} disabled={busy || changes.length === 0 || shifts.loading} className="flex-1 inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition">
            {busy && <Spinner />}
            {busy ? "Saving…" : changes.length === 0 ? "No changes" : `Save ${changes.length} change${changes.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
