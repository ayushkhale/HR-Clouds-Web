// ─────────────────────────────────────────────────────────────────────────────
// documents/TemplateDetailDialog.jsx — One blank company form: what it is,
// where it stands, its whole version history, and every action its state
// allows (#108, #109, #103, #104, #105, #106, #110).
//
// The version chain is the point of this dialog. A form group has one live
// version and however many retired ones behind it, and the question somebody
// opens this to answer is almost always "which one are people downloading?"
// So the chain is shown in full, live version marked, and each row can still
// be downloaded — HR auditing a claim from March needs the March sheet, not
// today's.
//
// Every action is gated by state rather than by role: the plane adapter has
// already decided what this viewer may do, and a capability it lacks is null.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HiArchive, HiCheckCircle, HiClipboardList, HiCloudDownload, HiCollection, HiDownload,
  HiExternalLink, HiEye, HiEyeOff, HiInformationCircle, HiLink, HiPencilAlt, HiRefresh,
  HiTemplate, HiTrash,
} from "react-icons/hi";
import DetailDialog, { DetailGrid, DetailSection, DetailText } from "../components/DetailDialog";
import ReasonDialog from "../components/ReasonDialog";
import { fmtDate, fmtDateTime } from "../attendance/dates";
import { documentErrorMessage, isTemplateStale } from "../utils/documentErrors";
import { contentTypeLabel, formatBytes } from "./documentMeta";
import { triggerDownload } from "./documentUpload";
import { TemplateStatusBadge } from "./phase5Ui";
import {
  TEMPLATE_ARCHIVE_REASON_MAX, canArchiveTemplate, canDeleteTemplate, canDownloadTemplate,
  canEditTemplate, canPublishTemplate, canReplaceTemplate, isReferenceTemplate, templateDownloadOf,
  templateNextStep, templateOf, templateStatusMeta, templateStorageLine, templateVersionsOf,
} from "./templateMeta";
import { DocErrorState, DANGER_BTN, PRIMARY_BTN, SECONDARY_BTN } from "./ui";

/**
 * @param {object} props
 * @param {object} props.template      at minimum `{ id }` — the rest is re-read
 * @param {object} props.plane         TEMPLATE_PLANES.hr
 * @param {Map}    [props.types]       document type index, for the "filed under" line
 * @param {(id: string, fallback?: string) => string} [props.nameOf]
 * @param {(message: string, tone?: string) => void} [props.showToast]
 * @param {() => void} [props.onChanged]
 * @param {(template: object) => void} [props.onEdit]
 * @param {(template: object) => void} [props.onReplace]
 * @param {() => void} props.onClose
 */
export default function TemplateDetailDialog({ template, plane, types, nameOf, showToast, onChanged, onEdit, onReplace, onClose }) {
  const [row, setRow] = useState(template);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState("");

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    if (!template?.id || !plane.get) return;
    const token = ++reqRef.current;
    setLoading(true);
    setError(null);
    try {
      const [detail, chain] = await Promise.all([
        plane.get(template.id),
        plane.versions ? plane.versions(template.id).catch(() => null) : Promise.resolve(null),
      ]);
      if (token !== reqRef.current) return;
      setRow(templateOf(detail) || template);
      setVersions(chain ? templateVersionsOf(chain) : []);
    } catch (err) {
      if (token === reqRef.current) setError(err);
    } finally {
      if (token === reqRef.current) setLoading(false);
    }
  }, [plane, template]);

  useEffect(() => { load(); }, [load]);

  /** Every lifecycle action reports the same way and re-reads the same way. */
  const act = async (key, run, message) => {
    if (busy) return;
    setBusy(key);
    try {
      const result = await run();
      showToast?.(message);
      onChanged?.();
      if (key === "delete") {
        onClose?.();
        return;
      }
      const next = templateOf(result);
      if (next?.id) setRow((r) => ({ ...r, ...next }));
      load();
    } catch (err) {
      showToast?.(documentErrorMessage(err, "Couldn't do that."), "error");
      // A refused transition means the form moved on under us; show where it is now.
      if (isTemplateStale(err)) load();
    } finally {
      setBusy("");
    }
  };

  /** Downloads are always fetched fresh: the signed link only lives 15 minutes. */
  const download = async (id = row?.id) => {
    if (!plane.downloadUrl || busy) return;
    setBusy(`download:${id}`);
    try {
      const { url } = templateDownloadOf(await plane.downloadUrl(id));
      if (!url) throw new Error("No download link came back.");
      triggerDownload(url);
    } catch (err) {
      showToast?.(documentErrorMessage(err, "Couldn't open the file."), "error");
    } finally {
      setBusy("");
    }
  };

  const archive = async (reason) => {
    setArchiveError("");
    try {
      const result = await plane.archive(row.id, reason);
      setArchiving(false);
      showToast?.("Form retired. Employees can no longer download it.");
      const next = templateOf(result);
      if (next?.id) setRow((r) => ({ ...r, ...next }));
      onChanged?.();
      load();
    } catch (err) {
      setArchiveError(documentErrorMessage(err, "Couldn't retire the form."));
    }
  };

  const remove = async () => {
    const ok = await window.confirm(
      `Delete this draft?\n\n“${row?.title || "This draft"}” has never been published, so nobody outside HR has seen it. This can't be undone.`,
    );
    if (!ok) return;
    act("delete", () => plane.remove(row.id), "Draft deleted.");
  };

  const publish = async () => {
    const live = versions.find((v) => v.status === "published" && v.id !== row.id);
    const ok = await window.confirm(
      live
        ? `Publish version ${row?.version}?\n\nEveryone in your organisation will download this from now on, and version ${live.version} stops being available to them straight away. It stays in your records.`
        : `Publish this form?\n\nEveryone in your organisation will be able to find and download it.`,
    );
    if (!ok) return;
    act("publish", () => plane.publish(row.id), live ? `Version ${row?.version} is live. Version ${live.version} has been replaced.` : "Form published. Everyone can download it now.");
  };

  const meta = templateStatusMeta(row?.status);
  const type = types?.get?.(row?.document_type_id) || null;
  const reference = isReferenceTemplate(row);
  const nextStep = templateNextStep(row);
  const downloads = Number(row?.download_count) || 0;

  const footer = (
    <>
      {canDeleteTemplate(row) && plane.remove && (
        <button type="button" onClick={remove} disabled={!!busy} className={`${DANGER_BTN} mr-auto`}>
          <HiTrash className="w-4 h-4" /> Delete draft
        </button>
      )}
      {canArchiveTemplate(row) && plane.archive && (
        <button type="button" onClick={() => setArchiving(true)} disabled={!!busy} className={`${SECONDARY_BTN} ${canDeleteTemplate(row) ? "" : "mr-auto"}`}>
          <HiArchive className="w-4 h-4" /> Retire
        </button>
      )}
      {canDownloadTemplate(row) && (
        <button type="button" onClick={() => download()} disabled={!!busy} className={SECONDARY_BTN}>
          {reference ? <HiExternalLink className="w-4 h-4" /> : <HiDownload className="w-4 h-4" />} {reference ? "Open the link" : "Download"}
        </button>
      )}
      {canEditTemplate(row) && onEdit && (
        <button type="button" onClick={() => onEdit(row)} disabled={!!busy} className={SECONDARY_BTN}>
          <HiPencilAlt className="w-4 h-4" /> Edit
        </button>
      )}
      {canReplaceTemplate(row) && onReplace && (
        <button type="button" onClick={() => onReplace(row)} disabled={!!busy} className={SECONDARY_BTN}>
          <HiRefresh className="w-4 h-4" /> New version
        </button>
      )}
      {canPublishTemplate(row) && plane.publish && (
        <button type="button" onClick={publish} disabled={!!busy} className={PRIMARY_BTN}>
          {busy === "publish" ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <HiCheckCircle className="w-4 h-4" />}
          Publish
        </button>
      )}
    </>
  );

  return (
    <>
      <DetailDialog
        title={row?.title || "Form"}
        subtitle={[templateStorageLine(row), type?.name].filter(Boolean).join(" · ")}
        eyebrow={`Blank form · version ${row?.version ?? "?"}`}
        icon={HiTemplate}
        badge={<TemplateStatusBadge status={row?.status} />}
        loading={loading && !row?.status}
        footer={footer}
        onClose={onClose}
      >
        {error ? (
          <DocErrorState error={error} onRetry={load} fallback="Couldn't load this form." />
        ) : (
          <>
            {/* Where it stands, said in a sentence before any field. */}
            <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${row?.status === "published" ? "border-violet-200 bg-violet-50/60" : "border-slate-200 bg-slate-50"}`}>
              <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 text-purple-600">
                {row?.status === "published" ? <HiCheckCircle className="w-5 h-5 text-violet-600" /> : row?.status === "draft" ? <HiPencilAlt className="w-5 h-5" /> : <HiArchive className="w-5 h-5" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">{meta.label}</p>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{nextStep || meta.hint}</p>
              </div>
            </div>

            {row?.description && <DetailText label="When to use it">{row.description}</DetailText>}

            <DetailSection title="The form" icon={HiClipboardList} collapsible={false}>
              <DetailGrid
                cols={3}
                items={[
                  { label: "Where it lives", value: templateStorageLine(row) },
                  { label: reference ? "Link" : "File", value: reference ? row?.reference_url || "N/A" : row?.file_name || "Not uploaded yet" },
                  { label: "Format", value: reference ? "Whatever the page serves" : contentTypeLabel(row?.content_type) },
                  { label: "Size", value: reference ? "N/A" : formatBytes(row?.size_bytes) },
                  { label: "Filed under", value: type?.name || "No particular type" },
                  { label: "Employees can find it", value: row?.is_employee_visible === false ? "No — HR only" : "Yes" },
                ]}
              />
              {!reference && row?.checksum_sha256 && (
                <p className="flex items-start gap-2 text-[11px] text-slate-400 mt-3">
                  <HiInformationCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  Checked against storage when it was uploaded{row.confirmed_at ? ` on ${fmtDateTime(row.confirmed_at)}` : ""}. Fingerprint {String(row.checksum_sha256).slice(0, 12)}…
                </p>
              )}
            </DetailSection>

            <DetailSection title="History" icon={HiCollection} collapsible={false}>
              <DetailGrid
                cols={3}
                items={[
                  { label: "Created", value: fmtDateTime(row?.created_at) },
                  { label: "Published", value: row?.published_at ? fmtDateTime(row.published_at) : "Not yet" },
                  { label: "Published by", value: row?.published_by ? (nameOf?.(row.published_by, "A colleague") || "A colleague") : "N/A" },
                  { label: "Retired", value: row?.archived_at ? fmtDateTime(row.archived_at) : "N/A" },
                  { label: "Retired by", value: row?.archived_by ? (nameOf?.(row.archived_by, "A colleague") || "A colleague") : "N/A" },
                  { label: "Downloads", value: downloads ? `${downloads.toLocaleString("en-IN")}` : "None yet" },
                ]}
              />
              {row?.status === "published" && (
                <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                  {downloads
                    ? `Downloaded ${downloads.toLocaleString("en-IN")} ${downloads === 1 ? "time" : "times"} across every version of this form. The count doesn’t reset when you publish a new version.`
                    : "Nobody has downloaded this yet. If people are still emailing HR for it, it may be worth mentioning where to find it."}
                </p>
              )}
            </DetailSection>

            {versions.length > 1 && (
              <DetailSection title={`Versions (${versions.length})`} icon={HiRefresh} collapsible={false}>
                <ul className="divide-y divide-slate-100">
                  {versions.map((version) => {
                    const current = version.id === row?.id;
                    return (
                      <li key={version.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${current ? "" : "opacity-90"}`}>
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${version.status === "published" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
                          v{version.version}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-800 truncate">{version.title || row?.title}</span>
                          <span className="block text-[11px] text-slate-400">
                            {version.published_at ? `Published ${fmtDate(version.published_at)}` : version.created_at ? `Created ${fmtDate(version.created_at)}` : ""}
                            {current ? " · you're looking at this one" : ""}
                          </span>
                        </span>
                        <TemplateStatusBadge status={version.status} />
                        {canDownloadTemplate(version) && plane.downloadUrl && (
                          <button
                            type="button"
                            onClick={() => download(version.id)}
                            disabled={!!busy}
                            className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800 disabled:opacity-50 px-2 py-1 rounded-lg hover:bg-purple-50"
                          >
                            {busy === `download:${version.id}`
                              ? <span className="inline-block w-3.5 h-3.5 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                              : <HiCloudDownload className="w-3.5 h-3.5" />}
                            Get
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                  Only the live version is in the employee catalogue. Older ones stay here so a claim filed on last year’s sheet can still be checked against the sheet it was filed on.
                </p>
              </DetailSection>
            )}

            {row?.is_employee_visible === false && row?.status === "published" && (
              <p className="flex items-start gap-2 text-xs text-fuchsia-900 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
                <HiEyeOff className="w-4 h-4 shrink-0 mt-px" />
                <span>This form is published but hidden from employees, so only HR can reach it. Turn “Employees can find this form” back on if that wasn’t intended — it can’t be changed once published, so you’d need a new version.</span>
              </p>
            )}

            {reference && (
              <p className="flex items-start gap-2 text-xs text-slate-500 leading-relaxed">
                <HiLink className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
                <span>This form isn’t stored here — the link is followed each time. If the page moves, the form stops working and nothing in this portal will notice. Worth checking now and then.</span>
              </p>
            )}

            {row?.status === "published" && (
              <p className="flex items-start gap-2 text-xs text-slate-500 leading-relaxed">
                <HiEye className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
                <span>Everyone in your organisation can download this, including managers and HR. Forms hold no personal information, so there’s nothing here that’s scoped to a team.</span>
              </p>
            )}
          </>
        )}
      </DetailDialog>

      {archiving && (
        <ReasonDialog
          title="Retire this form"
          description={<>It disappears from everyone’s Forms &amp; Templates straight away and can’t be downloaded again. The record and the file are kept. If you’re replacing it with an updated sheet, use <strong>New version</strong> instead — that swaps it over without a gap.</>}
          label="Why is it being retired? (optional)"
          placeholder="e.g. Claims are now filed through the health portal"
          confirmLabel="Retire the form"
          tone="danger"
          minLength={0}
          maxLength={TEMPLATE_ARCHIVE_REASON_MAX}
          error={archiveError}
          onSubmit={archive}
          onClose={() => { setArchiving(false); setArchiveError(""); }}
        />
      )}
    </>
  );
}
