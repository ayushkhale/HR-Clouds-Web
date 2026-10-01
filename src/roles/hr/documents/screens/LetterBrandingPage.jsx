// ─────────────────────────────────────────────────────────────────────────────
// LetterBrandingPage.jsx — The organisation's letterhead: who signs its letters,
// the registered address and registration numbers printed on them, the two
// images, and the accent colour. PDF Generation Phase 1 (#130–#134).
//
// This screen is the frame around every letter the company will ever issue, so
// it is built to be filled in once and then left alone. Four decisions:
//
//   · Reading #130 CREATES the row, so there is no "set up your letterhead"
//     empty state to design — a fresh organisation gets a normal form with the
//     defaults already in it. What replaces an empty state is the readiness
//     card: a plain list of what is still missing, which never blocks saving
//     because a sparse letterhead is legitimate.
//   · Preview shows what is SAVED, not what is on screen. Rather than let
//     somebody preview one thing and read another, the button turns into
//     "Save & preview" while there are unsaved changes.
//   · The two images upload the moment one is chosen. There is nothing else to
//     fill in for them, and the three-step handshake behind it (#132 → PUT →
//     #133) has a ten-minute claim, so making somebody press Upload afterwards
//     only creates a window in which the claim expires.
//   · Thumbnails come from signed URLs that die after five minutes (#130
//     `include_asset_urls`). A broken image therefore means "the link aged out",
//     not "the logo is gone" — so the card falls back to the stored format and
//     size, which the record always carries, and never to a broken frame.
//
// Contract traps, all three confirmed against the live API on 2026-09-27:
//   · #131 is a partial update EXCEPT for `registered_address_lines` — omit that
//     key and the saved address is erased. So the save sends `brandingPayload()`,
//     which always carries it, while `brandingChanges()` (the diff) is only used
//     to decide whether the Save bar shows. Do not "tidy" the save to send the
//     diff alone: editing a phone number would silently wipe the address.
//   · `accent_color_hex` is refused as `""` AND as `null` (400), so the colour is
//     only ever sent as a real `#RRGGBB` and the form offers no way to clear it.
//   · The asset fields are never part of the text save; #131 doesn't touch them.
// One documented rule does NOT hold live: an empty PUT body answers 200, not the
// 400 the spec describes. Save stays disabled with nothing changed anyway.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiBadgeCheck, HiCheckCircle, HiColorSwatch, HiExternalLink, HiEye, HiIdentification,
  HiInformationCircle, HiMail, HiOfficeBuilding, HiPencilAlt, HiPhotograph, HiPlus,
  HiPrinter, HiRefresh, HiTrash, HiUpload,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import FieldHelp, { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";
import { documentsAPI } from "../../../../shared/api";
import { Toast, useToast } from "../../../../shared/attendance/ui";
import { fmtDateTime } from "../../../../shared/attendance/dates";
import { letterErrorMessage } from "../../../../shared/utils/documentErrors";
import { DocErrorState, FIELD, LABEL, PRIMARY_BTN, SECONDARY_BTN, SwitchRow } from "../../../../shared/documents/ui";
import { fileProblem } from "../../../../shared/documents/documentMeta";
import { uploadLetterAsset } from "../../../../shared/documents/documentUpload";
import LetterPreviewDialog from "../../../../shared/documents/LetterPreviewDialog";
import {
  ACCENT_SUGGESTIONS, ADDRESS_LINE_LIMIT, ADDRESS_LINE_MAX, BRANDING_GROUPS, LETTER_ASSETS,
  brandingChanges, brandingOf, brandingPayload, brandingProblems, brandingToForm, inheritedAddressLines,
  inheritedValue, letterAssetLimitLine, letterAssetMeta, letterAssetState, letterheadGaps,
} from "../../../../shared/documents/letterMeta";

/** Maps each BRANDING_GROUPS id → a HeroIcon component for the card header. */
const GROUP_ICON = {
  signatory:   HiBadgeCheck,
  identifiers: HiIdentification,
  contact:     HiMail,
  footer:      HiPrinter,
};

function Card({ title, icon: Icon, blurb, children, action, className = "" }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-100 shadow-xs ${className}`}>
      <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-800">{title}</h2>
            {blurb && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{blurb}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="px-5 sm:px-6 pb-5">{children}</div>
    </section>
  );
}

/**
 * One letterhead image: what is on file, and a picker that uploads straight
 * away. The thumbnail is best-effort — its URL lasts five minutes — so the
 * format and size line underneath is the part that is always true.
 */
function AssetCard({ assetKey, branding, url, busy, onPick }) {
  const meta = letterAssetMeta(assetKey);
  const state = letterAssetState(branding, assetKey);
  const inputRef = useRef(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [problem, setProblem] = useState("");

  // A fresh URL after an upload or a refresh deserves a fresh attempt at it.
  useEffect(() => { setImageFailed(false); }, [url]);

  const choose = (file) => {
    if (!file) return;
    const why = fileProblem(file, { allowed: ["image/png", "image/jpeg"], maxBytes: meta.maxBytes });
    setProblem(why);
    if (!why) onPick(file);
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-xs p-4">
      <input
        ref={inputRef} type="file" className="sr-only" accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        id={`letter-asset-${assetKey}`}
        onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{meta.label}</p>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{meta.blurb}</p>
        </div>
        {state.present && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-bold shrink-0">
            <HiCheckCircle className="w-3 h-3" /> On file
          </span>
        )}
      </div>

      <div className="mt-3 h-28 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 flex items-center justify-center overflow-hidden px-3">
        {busy ? (
          <span className="inline-flex items-center gap-2 text-xs font-bold text-purple-700">
            <span className="inline-block w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" /> Uploading…
          </span>
        ) : url && !imageFailed ? (
          <img src={url} alt={meta.label} className="max-h-24 max-w-full object-contain" onError={() => setImageFailed(true)} />
        ) : state.present ? (
          <div className="text-center">
            <HiPhotograph className="w-6 h-6 text-slate-300 mx-auto" />
            <p className="text-[11px] font-semibold text-slate-500 mt-1">{state.line || "Image on file"}</p>
            <p className="text-xs text-slate-400">Refresh the page to see it again</p>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 text-center">Nothing uploaded yet</p>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-2">{letterAssetLimitLine(assetKey)}{state.present && state.line ? ` · now ${state.line}` : ""}</p>
      {problem && <p className="text-[11px] font-semibold text-rose-600 mt-1.5">{problem}</p>}

      <button
        type="button" disabled={busy} onClick={() => inputRef.current?.click()}
        className={`${SECONDARY_BTN} w-full mt-3`}
      >
        <HiUpload className="w-4 h-4" /> {state.present ? `Replace ${meta.label.toLowerCase()}` : `Upload ${meta.label.toLowerCase()}`}
      </button>
    </div>
  );
}

export default function LetterBrandingPage() {
  const { toast, showToast, clearToast } = useToast();
  const [record, setRecord] = useState(null);      // { branding, inherited, assets }
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploading, setUploading] = useState("");  // "logo" | "signature" | ""
  const [previewing, setPreviewing] = useState(false);

  const reqRef = useRef(0);
  /**
   * `resetForm: false` re-reads the record without touching the form — which is
   * what an image upload needs. An upload changes the record but not one text
   * field, so resetting the form there would quietly throw away whatever the
   * person had typed before they chose the file.
   */
  const load = useCallback(async ({ resetForm = true } = {}) => {
    const token = ++reqRef.current;
    setError(null);
    try {
      // The thumbnails are the only reason to ask for signed URLs, and they
      // expire in five minutes — so they are fetched per load, never cached.
      const next = brandingOf(await documentsAPI.getLetterBranding({ include_asset_urls: true }));
      if (token !== reqRef.current) return;
      setRecord(next);
      if (resetForm) setForm(brandingToForm(next.branding));
    } catch (err) {
      if (token === reqRef.current) setError(err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Memoised because four hooks below depend on them; a fresh `{}` each render
  // would re-run every one of them on every keystroke.
  const branding = useMemo(() => record?.branding || {}, [record]);
  const inherited = useMemo(() => record?.inherited || {}, [record]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setLine = (index, value) => setForm((f) => {
    const lines = [...(f.registered_address_lines || [])];
    lines[index] = value;
    return { ...f, registered_address_lines: lines };
  });

  const problems = useMemo(() => (form ? brandingProblems(form) : {}), [form]);
  const changes = useMemo(() => (form && record ? brandingChanges(form, branding) : {}), [form, record, branding]);
  const dirty = Object.keys(changes).length > 0;
  const blocked = Object.keys(problems).length > 0;
  const gaps = useMemo(() => letterheadGaps(branding, inherited), [branding, inherited]);
  const profileAddress = useMemo(() => inheritedAddressLines(inherited), [inherited]);

  /** Returns true when the letterhead is saved and safe to preview. */
  const save = async () => {
    if (!dirty || blocked || saving) return false;
    setSaving(true);
    setSaveError("");
    try {
      // The payload, not the diff: #131 erases the registered address whenever
      // its key is absent, so it rides on every save. See letterMeta's header.
      const next = brandingOf(await documentsAPI.updateLetterBranding(brandingPayload(form, branding)));
      setRecord((cur) => ({ ...next, assets: { ...(cur?.assets || {}), ...next.assets } }));
      setForm(brandingToForm(next.branding));
      showToast("Letterhead saved. Every letter from now on uses it.");
      return true;
    } catch (err) {
      setSaveError(letterErrorMessage(err, "Couldn’t save the letterhead."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    // Previewing what is saved while the form says something else is the one
    // confusion worth spending a click to avoid.
    if (dirty && !(await save())) return;
    setPreviewing(true);
  };

  const upload = async (assetKey, file) => {
    if (uploading) return;
    setUploading(assetKey);
    setSaveError("");
    try {
      const next = brandingOf(await uploadLetterAsset({
        issue: documentsAPI.createLetterAssetUploadUrl,
        confirm: documentsAPI.confirmLetterAsset,
        file,
        assetType: assetKey,
      }));
      // The confirm reply carries no signed URLs, so the thumbnail comes from a
      // fresh read rather than from the write.
      setRecord((cur) => ({ ...cur, ...next, assets: next.assets }));
      showToast(`${letterAssetMeta(assetKey).label} uploaded.`);
      load({ resetForm: false });
    } catch (err) {
      // The three steps fail differently and only one of them is the network's
      // fault, so the sentence has to say which — "try again" is wrong advice
      // for an image that is simply too big.
      showToast(err?.stage === "put"
        ? "The image couldn’t reach secure storage. Check your connection and choose it again."
        : letterErrorMessage(err?.cause ?? err, "Couldn’t upload the image. Choose it again."), "error");
    } finally {
      setUploading("");
    }
  };

  const lines = form?.registered_address_lines || [];
  const canAddLine = lines.length < ADDRESS_LINE_LIMIT;
  const digital = form?.letterhead_enabled !== false;

  const previewLabel = dirty ? "Save & preview" : "Preview letterhead";

  return (
    <>
      <DashboardTopBar title="Letterhead & Branding" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900"><HelpLabel text="Letterhead & Branding" help={{ surface: "documents.letterhead", field: "page", label: "the Letterhead & Branding page" }} /></h1>
            <p className="text-sm text-slate-500 mt-1">
              The frame around every letter your company issues. Set it once and every letter follows.
              {branding?.updated_at && <span className="text-slate-400"> Last changed {fmtDateTime(branding.updated_at)}.</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button
              type="button" onClick={() => load({ resetForm: !dirty })} disabled={!record && !error}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50"
              aria-label="Refresh" title="Refresh"
            >
              <HiRefresh className="w-4 h-4" />
            </button>
            <button type="button" onClick={preview} disabled={!record || blocked || saving} className={PRIMARY_BTN}>
              <HiEye className="w-4 h-4" /> {previewLabel}
            </button>
          </div>
        </div>

        {error ? (
          <div className="bg-white rounded-2xl border border-slate-100">
            <DocErrorState error={error} onRetry={() => load()} fallback="Couldn’t load your letterhead." />
          </div>
        ) : !form ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-44 bg-slate-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <Card
                title="How letters are printed" icon={HiPrinter} className="lg:col-span-2"
                blurb="Switch this off only if you buy pre-printed paper with your crest already on it."
              >
                <SwitchRow
                  title="Draw our letterhead on the page"
                  description={digital
                    ? "The logo, address, registration numbers and footer are printed on every letter."
                    : "The top and bottom are left blank for your own paper. What you fill in below is kept, just not printed."}
                  checked={digital}
                  onChange={(v) => set("letterhead_enabled", v)}
                />
              </Card>

              <Card
                title={gaps.length ? "Still to fill in" : "Ready to use"} icon={gaps.length ? HiInformationCircle : HiCheckCircle}
                blurb={gaps.length
                  ? "None of this stops you saving — letters simply leave out what isn’t there."
                  : "Your letterhead has everything a finished letter needs."}
              >
                {gaps.length ? (
                  <ul className="space-y-1.5">
                    {gaps.map((gap) => (
                      <li key={gap} className="flex items-start gap-2 text-xs text-slate-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 mt-1.5 shrink-0" />
                        <span className="first-letter:uppercase">{gap}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Preview it to check how the page looks, then switch on the letters you want to use.{" "}
                    <Link to="/dashboard/hr/documents/letter-templates" className="font-bold text-purple-600 hover:underline">
                      Letter Templates <HiExternalLink className="inline w-3 h-3" />
                    </Link>
                  </p>
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 space-y-6">
                {BRANDING_GROUPS.map((group) => (
                  <Card key={group.id} title={group.title} icon={GROUP_ICON[group.id] || HiPencilAlt} blurb={group.blurb}>
                    <div className={group.fields.length > 1 ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : ""}>
                      {group.fields.map((field) => {
                        const profile = inheritedValue(field.key, inherited);
                        const value = form[field.key] ?? "";
                        return (
                          <div key={field.key} className="min-w-0">
                            {/* Wired by key; the config decides which fields carry an ⓘ. */}
                            <div className="flex items-center">
                              <label htmlFor={`lb-${field.key}`} className={LABEL}>{field.label}</label>
                              <FieldHelp surface="documents.letterhead" field={field.key} label={field.label} className="mb-2" />
                            </div>
                            {field.multiline ? (
                              <textarea
                                id={`lb-${field.key}`} rows={2} value={value} maxLength={field.max}
                                placeholder={field.placeholder}
                                onChange={(e) => set(field.key, e.target.value)}
                                className={`${FIELD} resize-y`}
                              />
                            ) : (
                              <input
                                id={`lb-${field.key}`} type="text" value={value} maxLength={field.max}
                                placeholder={field.placeholder}
                                onChange={(e) => set(field.key, e.target.value)}
                                className={FIELD}
                              />
                            )}
                            {problems[field.key] ? (
                              <p className="text-xs font-semibold text-rose-600 mt-1">{problems[field.key]}</p>
                            ) : field.help ? (
                              <p className="text-xs text-slate-400 mt-1">{field.help}</p>
                            ) : null}
                            {!value && profile && (
                              <p className="text-xs text-slate-400 mt-1 truncate">
                                Profile has <span className="font-semibold text-slate-500">{profile}</span> —{" "}
                                <button type="button" onClick={() => set(field.key, profile)} className="font-bold text-purple-600 hover:underline">use it</button>
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ))}

                <Card
                  title="Registered address" icon={HiOfficeBuilding}
                  blurb={`The office address printed on the letter. Up to ${ADDRESS_LINE_LIMIT} lines — any more would push the header off the page.`}
                  action={profileAddress.length ? (
                    <button
                      type="button"
                      onClick={() => set("registered_address_lines", profileAddress)}
                      className="text-xs font-bold text-purple-600 hover:underline shrink-0"
                    >
                      Use company profile address
                    </button>
                  ) : null}
                >
                  <div className="space-y-2">
                    {lines.map((line, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <input
                            type="text" value={line} maxLength={ADDRESS_LINE_MAX}
                            aria-label={`Address line ${index + 1}`}
                            placeholder={index === 0 ? "Building and street" : index === 1 ? "Area" : "Town, state and postcode"}
                            onChange={(e) => setLine(index, e.target.value)}
                            className={FIELD}
                          />
                          {problems[`address_${index}`] && <p className="text-xs font-semibold text-rose-600 mt-1">{problems[`address_${index}`]}</p>}
                        </div>
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => set("registered_address_lines", lines.filter((_, i) => i !== index))}
                            className="h-[42px] px-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 shrink-0"
                            aria-label={`Remove address line ${index + 1}`}
                          >
                            <HiTrash className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {canAddLine && (
                    <button
                      type="button" onClick={() => set("registered_address_lines", [...lines, ""])}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-800 mt-3"
                    >
                      <HiPlus className="w-3.5 h-3.5" /> Add a line
                    </button>
                  )}
                  {!lines.some(Boolean) && profileAddress.length > 0 && (
                    <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                      Left blank, letters fall back to the address on your company profile: {profileAddress.join(", ")}.
                    </p>
                  )}
                </Card>
              </div>

              <div className="space-y-6 lg:sticky lg:top-6">
                {LETTER_ASSETS.map((asset) => (
                  <AssetCard
                    key={asset.key}
                    assetKey={asset.key}
                    branding={branding}
                    url={record?.assets?.[`${asset.key}_url`] || ""}
                    busy={uploading === asset.key}
                    onPick={(file) => upload(asset.key, file)}
                  />
                ))}

                <Card title="Brand colour" icon={HiColorSwatch} blurb="Used for the rule under the header, table headings and highlighted boxes.">
                  <div className="flex items-center gap-3">
                    <input
                      type="color" aria-label="Pick a brand colour"
                      value={/^#[0-9A-Fa-f]{6}$/.test(form.accent_color_hex) ? form.accent_color_hex : "#1F2937"}
                      onChange={(e) => set("accent_color_hex", e.target.value.toUpperCase())}
                      className="w-12 h-11 rounded-xl border border-slate-200 bg-white p-1 cursor-pointer shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <label htmlFor="lb-accent" className="sr-only">Colour code</label>
                      <input
                        id="lb-accent" type="text" value={form.accent_color_hex} maxLength={7}
                        onChange={(e) => set("accent_color_hex", e.target.value.toUpperCase())}
                        className={`${FIELD} font-mono tracking-wide`}
                      />
                    </div>
                  </div>
                  {problems.accent_color_hex && <p className="text-xs font-semibold text-rose-600 mt-1.5">{problems.accent_color_hex}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {ACCENT_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion.hex} type="button" title={suggestion.name}
                        onClick={() => set("accent_color_hex", suggestion.hex)}
                        aria-label={`Use ${suggestion.name}`}
                        className={`w-7 h-7 rounded-lg border-2 transition ${form.accent_color_hex?.toUpperCase() === suggestion.hex ? "border-slate-800 scale-105" : "border-white ring-1 ring-slate-200"}`}
                        style={{ backgroundColor: suggestion.hex }}
                      />
                    ))}
                  </div>
                </Card>
              </div>
            </div>


            {saveError && (
              <p className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3" role="alert">{saveError}</p>
            )}

            {dirty && (
              <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 bg-white/95 backdrop-blur border border-slate-200 shadow-lg rounded-2xl px-4 py-3">
                <p className="mr-auto text-xs font-semibold text-slate-600">
                  {blocked
                    ? "Fix the fields marked in red first."
                    : `${Object.keys(changes).length} unsaved ${Object.keys(changes).length === 1 ? "change" : "changes"} — letters issued after you save will use them.`}
                </p>
                <button type="button" onClick={() => { setForm(brandingToForm(branding)); setSaveError(""); }} disabled={saving} className={SECONDARY_BTN}>Discard</button>
                <button type="button" onClick={save} disabled={blocked || saving} className={PRIMARY_BTN}>
                  <HiCheckCircle className="w-4 h-4" /> {saving ? "Saving…" : "Save letterhead"}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {previewing && (
        <LetterPreviewDialog
          title="Your letterhead"
          subtitle="A blank page with your header, footer and signature block"
          render={documentsAPI.previewLetterBranding}
          note={digital ? "" : "Your letterhead is switched off, so this page shows the blank margins your pre-printed paper needs."}
          onClose={() => setPreviewing(false)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
