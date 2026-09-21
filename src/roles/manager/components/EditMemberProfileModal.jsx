import React, { useEffect, useState } from "react";
import { HiExclamationCircle, HiPencil, HiX } from "react-icons/hi";
import { organizationAPI } from "../../../shared/api";

const FIELD = "w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition";
const LABEL = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5";

/**
 * The fields a manager may change on a direct report: name, phone and photo.
 * `profile` is the detail record when the caller already has it; otherwise it
 * is loaded here, because the roster projection carries no phone or photo and
 * saving blanks over them would clear real values.
 */
export default function EditMemberProfileModal({ userId, name, profile, onClose, onSaved }) {
  const blank = { name: name || "", phone_number: "", avatar_url: "" };
  const seed = (d) => ({
    name: d?.name || name || "",
    phone_number: d?.phone_number || d?.contact || "",
    avatar_url: d?.avatar_url || d?.avatar || "",
  });
  const [form, setForm] = useState(profile ? seed(profile) : blank);
  const [initial, setInitial] = useState(profile ? seed(profile) : blank);
  const [loading, setLoading] = useState(!profile);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (profile) return undefined;
    if (!userId) {
      setError("This team member has no resolvable id.");
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    organizationAPI.getEmployee(userId)
      .then((res) => {
        if (cancelled) return;
        const seeded = seed(res?.data);
        setForm(seeded);
        setInitial(seeded);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.data?.message || "Could not load the current profile. Only fields you edit will be saved.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profile]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !submitting && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!userId) return;
    if (!form.name.trim()) {
      setError("Name cannot be empty.");
      return;
    }

    // Send only what changed, so untouched fields are never cleared.
    const payload = {};
    if (form.name.trim() !== initial.name) payload.name = form.name.trim();
    if (form.phone_number.trim() !== initial.phone_number) payload.phone_number = form.phone_number.trim();
    if (form.avatar_url.trim() !== initial.avatar_url) payload.avatar_url = form.avatar_url.trim();
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      await organizationAPI.updateEmployeeProfile(userId, payload);
      onSaved?.(`${form.name.trim()}'s profile was updated.`);
    } catch (err) {
      setError(err?.data?.message || err.message || "Failed to update profile.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <HiPencil className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Edit profile</h2>
              <p className="text-xs text-slate-400 mt-0.5">Update {name || "this team member"}&apos;s details.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400" aria-label="Close">
            <HiX className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}
          <div>
            <label className={LABEL} htmlFor="member-name">Name</label>
            <input id="member-name" type="text" name="name" value={form.name} onChange={handleChange} disabled={loading} className={FIELD} required />
          </div>
          <div>
            <label className={LABEL} htmlFor="member-phone">Phone number</label>
            <input id="member-phone" type="text" name="phone_number" value={form.phone_number} onChange={handleChange} disabled={loading} className={FIELD} />
          </div>
          <div>
            <label className={LABEL} htmlFor="member-photo">Photo link</label>
            <input id="member-photo" type="url" name="avatar_url" value={form.avatar_url} onChange={handleChange} disabled={loading} placeholder="https://..." className={FIELD} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
          <button type="submit" disabled={submitting || loading} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-60">
            {loading ? "Loading…" : submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
