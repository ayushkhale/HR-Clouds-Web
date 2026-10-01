// ─────────────────────────────────────────────────────────────────────────────
// documents/LetterTemplateConfigDialog.jsx — Switch one standard letter on or
// off for the organisation and save the wording that is the same on every copy
// of it (#136 read, #137 write, #138 preview).
//
// This is a form, not a record inspector, so it follows the form pattern: one
// panel, labelled boxes, a pinned footer.
//
// The form is BUILT FROM THE SERVER, and that is the whole design. #136 sends a
// descriptor — `[{ key, label, type, max_length, required }]` — and the boxes
// come from it. Nothing here hard-codes "place of issue" or "HR contact line",
// because #137 refuses an unknown key with a 400 rather than dropping it, and
// because a fourth standard letter must become usable without a frontend
// release. The one thing this file's own domain map adds is the plain
// explanation of what each letter is FOR, which the API has no field for.
//
// Two contract details are handled deliberately here:
//
//  · A blank box means "no default", so its key is left out of `saved_fields`
//    altogether rather than sent as "". `saved_fields` is a full replace, so
//    that is also how a saved default is removed. Sending "" would print a gap
//    in a real letter — exactly what the completeness check exists to stop.
//  · The preview sends `use_saved_fields: false` and passes everything on screen
//    as `override_fields`. It therefore shows what is in front of the person,
//    saved or not, AND can never hit the 409 a switched-off letter answers when
//    saved wording is asked for. One call, no ordering rules, nothing to explain.
//
// Known gap, deliberately left: #137 also stores `reference_pattern`,
// `requires_acknowledgement` and `is_confidential`, which Phase 1 neither reads
// nor returns on #136. Since a write is a full replace and the read can't tell
// us what they were, this dialog doesn't send them — so a later phase that
// starts setting them must return them on #136 first, or a save here would
// clear them.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HiCheckCircle, HiCog, HiExclamationCircle, HiEye, HiInformationCircle, HiRefresh, HiX,
} from "react-icons/hi";
import { letterErrorMessage } from "../utils/documentErrors";
import { FIELD, LABEL, PRIMARY_BTN, SECONDARY_BTN, SwitchRow } from "./ui";
import { hrFieldMeta, letterMatrix } from "./letterFieldMatrix";
import { humanizeCode } from "./documentMeta";
import LetterPreviewDialog from "./LetterPreviewDialog";
import {
  fieldLabel, letterAudience, letterPurpose, letterTemplateOf, letterTitle,
  sampleText, savedFieldInputProps, savedFieldProblems, savedFieldsPayload, savedFieldsToForm,
} from "./letterMeta";

/**
 * @param {object} props
 * @param {object} props.row      the catalog row that was opened (#135)
 * @param {object} props.api      documentsAPI
 * @param {(config: object, note: string) => void} props.onSaved
 * @param {() => void} props.onClose
 */
export default function LetterTemplateConfigDialog({ row, api, onSaved, onClose }) {
  const code = row?.code;
  const [loaded, setLoaded] = useState(null);   // { template, config }
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(null);       // { is_enabled, values }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [touched, setTouched] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    if (!code) return;
    const token = ++reqRef.current;
    setLoadError(null);
    try {
      const next = letterTemplateOf(await api.getLetterTemplate(code));
      if (token !== reqRef.current) return;
      setLoaded(next);
      setForm({
        is_enabled: !!next.config?.is_enabled,
        values: savedFieldsToForm(next.template.fields, next.config?.saved_fields),
      });
    } catch (err) {
      if (token === reqRef.current) setLoadError(err);
    }
  }, [api, code]);

  useEffect(() => { load(); }, [load]);

  const template = loaded?.template;
  // Memoised because the validation memo and the preview both depend on it; a
  // fresh `[]` each render would re-validate on every keystroke elsewhere.
  const fields = useMemo(() => template?.fields || [], [template]);
  const problems = useMemo(() => (form ? savedFieldProblems(fields, form.values) : {}), [form, fields]);
  const blocked = Object.keys(problems).length > 0;
  const busy = saving;

  const setValue = (key, value) => setForm((f) => ({ ...f, values: { ...f.values, [key]: value } }));

  const save = async () => {
    if (!form || blocked || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await api.updateLetterTemplateConfig(code, {
        is_enabled: !!form.is_enabled,
        saved_fields: savedFieldsPayload(fields, form.values),
        // Echoed back unchanged: Phase 1 offers no version choice (there is one
        // version), and omitting it on a full replace would silently unpin.
        pinned_version: loaded?.config?.pinned_version ?? null,
      });
      const config = res?.data?.config || res?.config || null;
      onSaved?.(config, form.is_enabled
        ? `“${letterTitle(row)}” is switched on and ready to use.`
        : `“${letterTitle(row)}” is switched off. Nobody can prepare it until you switch it back on.`);
    } catch (err) {
      setSaveError(letterErrorMessage(err, "Couldn’t save this letter’s settings."));
      setSaving(false);
    }
  };

  // Sample wording the letter fills in for itself, so it is clear which parts of
  // the page are not HR's to set here. Shown with the sample values, because
  // "employee_name" on its own explains nothing.
  const typedKeys = useMemo(() => new Set((letterMatrix(code)?.hr || []).map((f) => f.key)), [code]);
  const bodyFields = useMemo(() => {
    if (!template) return [];
    return [
      ...template.required_fields.map((key) => ({ key, required: true })),
      ...template.optional_fields.map((key) => ({ key, required: false })),
    ].map((item) => ({
      ...item,
      // The published field table (letterFieldMatrix.js) says which of these
      // are typed in at issue time rather than read from the person's record —
      // a Show Cause Notice's allegation is not "taken from the person".
      typed: typedKeys.has(item.key),
      label: hrFieldMeta(item.key)?.label || humanizeCode(item.key),
      // Not every sample is a string — `appointment_letter` sends its pay
      // breakdown as a list of objects, which `String()` would print as
      // "[object Object]". See sampleText().
      sample: sampleText(template.sample_data?.[item.key]),
    }));
  }, [template, typedKeys]);

  const title = letterTitle(row);
  const purpose = letterPurpose(code);

  return (
    <>
      <div
        className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
        onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
      >
        <div
          role="dialog" aria-modal="true" aria-label={`Set up ${title}`}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiCog className="w-5 h-5" /></span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-800 truncate">{title}</h2>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{purpose || "Set this letter up for your organisation."}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg disabled:opacity-40" aria-label="Close">
              <HiX className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            {loadError ? (
              <div className="text-center py-8">
                <HiExclamationCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700 max-w-md mx-auto">{letterErrorMessage(loadError, "Couldn’t open this letter.")}</p>
                <button type="button" onClick={load} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">
                  <HiRefresh className="w-4 h-4" /> Try again
                </button>
              </div>
            ) : !form ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 divide-y divide-slate-100">
                  <SwitchRow
                    title="Use this letter"
                    description={form.is_enabled
                      ? "HR can prepare this letter. Anything you save below is filled in for them automatically."
                      : "Switched off. Nobody can prepare this letter, and it can only be previewed with sample wording."}
                    checked={form.is_enabled}
                    onChange={(v) => { setForm((f) => ({ ...f, is_enabled: v })); setTouched(true); }}
                    disabled={busy}
                  />
                </div>

                {fields.length > 0 ? (
                  <div>
                    <div className="flex items-start gap-2 mb-3">
                      <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-500 leading-relaxed">
                        These are the same on every copy of this letter, so fill them in once here rather than on each one.
                        Leave a box empty and nobody is asked for it.
                      </p>
                    </div>
                    <div className="space-y-4">
                      {fields.map((field) => {
                        const key = field.key;
                        const max = Number(field.max_length);
                        const isNumber = field.type === "number";
                        const value = form.values[key] ?? "";
                        return (
                          <div key={key}>
                            <label htmlFor={`ltc-${key}`} className={LABEL}>
                              {fieldLabel(field)}
                              {!field.required && <span className="normal-case font-semibold text-slate-400"> (optional)</span>}
                            </label>
                            <input
                              id={`ltc-${key}`} value={value} disabled={busy}
                              {...savedFieldInputProps(field)}
                              onChange={(e) => { setValue(key, e.target.value); setTouched(true); }}
                              className={isNumber ? `${FIELD} sm:max-w-[10rem]` : FIELD}
                            />
                            {/* For a number, `max_length` is the largest value (§8.2 quirk), not a length. */}
                            <p className={`text-[10px] mt-1 ${problems[key] ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                              {problems[key] || (Number.isFinite(max) && max > 0
                                ? (isNumber ? `A whole number from 1 to ${max}.` : `Up to ${max} characters.`)
                                : "")}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3">
                    <HiInformationCircle className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
                    This letter has nothing to set up in advance — everything on it comes from the person it is about and from your letterhead.
                  </p>
                )}

                {bodyFields.length > 0 && (
                  <div>
                    <p className={LABEL}>What the letter fills in by itself</p>
                    <p className="text-xs text-slate-500 leading-relaxed -mt-1 mb-2">
                      Mostly taken from the person the letter is about; anything marked “Typed in” is written by HR when the letter is issued. In a preview these are made-up examples, shown here so you can see where each part of the page comes from.
                    </p>
                    <div className="rounded-2xl border border-slate-100 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <tbody className="divide-y divide-slate-50">
                          {bodyFields.map((item) => (
                            <tr key={item.key} className="bg-white">
                              <td className="px-3.5 py-2 font-semibold text-slate-600 w-1/3">{item.label}</td>
                              <td className="px-3.5 py-2 text-slate-500">{item.sample || "N/A"}</td>
                              <td className="px-3.5 py-2 text-right w-24">
                                {item.typed
                                  ? <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wide whitespace-nowrap">Typed in</span>
                                  : item.required
                                    ? <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Always</span>
                                    : <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">If known</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {saveError && (
                  <p className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3" role="alert">{saveError}</p>
                )}
              </>
            )}
          </div>

          <div className="shrink-0 flex flex-wrap items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
            <p className="mr-auto text-[11px] text-slate-400 max-w-xs leading-relaxed">
              {touched ? "A preview uses the wording on screen, saved or not." : "Preview it to see the finished page before switching it on."}
            </p>
            <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BTN}>Close</button>
            <button type="button" onClick={() => setPreviewing(true)} disabled={!form || blocked || busy} className={SECONDARY_BTN}>
              <HiEye className="w-4 h-4" /> Preview
            </button>
            <button type="button" onClick={save} disabled={!form || blocked || busy} className={PRIMARY_BTN}>
              <HiCheckCircle className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {/* A sibling of the form, not a child, so its own Escape and backdrop
          don't reach through to the form underneath. */}
      {previewing && form && (
        <LetterPreviewDialog
          title={title}
          subtitle={letterAudience(code) || "Sample letter on your letterhead"}
          render={() => api.previewLetterTemplate(code, {
            use_saved_fields: false,
            override_fields: savedFieldsPayload(fields, form.values),
          })}
          note="Drawn with the wording on screen — saving isn’t needed to try something out."
          onClose={() => setPreviewing(false)}
        />
      )}
    </>
  );
}
