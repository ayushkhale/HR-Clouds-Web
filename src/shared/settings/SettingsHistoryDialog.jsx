// ─────────────────────────────────────────────────────────────────────────────
// SettingsHistoryDialog.jsx — One settings change, opened from its row (#248).
//
// A DetailDialog, because this is a record being inspected and §3 makes that
// the house standard for every popup showing data. Nothing here is editable
// and nothing can be undone from it — the history is append-only — so the
// footer says why there are no actions rather than leaving an empty bar.
//
// The before/after pair is the whole point of the screen, so it is a two-up
// DetailGrid at the top rather than a row buried in a table: "what was it, and
// what is it now" is the question that brought the reader here.
//
// NOT SHOWN, deliberately: `audit_source` (which of our three tables the row
// came from) and `request_id`. Both are ours, not theirs — the same reason
// billing never prints `settled_via`. A support engineer who needs the
// correlation id has the logs.
// ─────────────────────────────────────────────────────────────────────────────

import { HiArrowRight, HiClock, HiPencilAlt, HiUser } from "react-icons/hi";
import DetailDialog, {
  DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailText,
} from "../components/DetailDialog";
import { fmtDateTime } from "../attendance/dates";
import { changeActorName, changeSourceLabel, displaySettingValue, moduleLabel } from "./settingsMeta";

/**
 * @param {object} props
 * @param {object} props.item     one #248 `items[]` row
 * @param {object} [props.entry]  the catalogue definition for its setting key
 * @param {object} [props.group]  the catalogue group it belongs to
 * @param {(id: string) => string} [props.nameOf]  directory name resolver
 * @param {() => void} props.onClose
 */
export default function SettingsHistoryDialog({ item, entry, group, nameOf, onClose }) {
  const actor = changeActorName(item?.actor, nameOf);
  const where = changeSourceLabel(item?.source);

  return (
    <DetailDialog
      eyebrow={group?.label || moduleLabel(item?.group)}
      icon={HiPencilAlt}
      title={entry?.label || item?.setting_key}
      subtitle={fmtDateTime(item?.occurred_at)}
      badge={where ? <DetailPill tone="soft">{where}</DetailPill> : null}
      width="medium"
      onClose={onClose}
      footer={
        <DetailFooterNote>
          The change record can’t be edited or undone from here — it’s kept exactly as it happened. Change the setting again to move it on.
        </DetailFooterNote>
      }
    >
      {/* Before and after, side by side, because that is the question. */}
      <DetailSection title="What changed" icon={HiArrowRight} collapsible={false}>
        <DetailGrid
          cols={2}
          items={[
            { label: "Was", value: displaySettingValue(item?.old_value, entry) },
            { label: "Became", value: displaySettingValue(item?.new_value, entry) },
          ]}
        />
        {entry?.description && (
          <p className="text-[11px] text-slate-500 leading-relaxed mt-3">{entry.description}</p>
        )}
      </DetailSection>

      <DetailSection title="Who and when" icon={HiUser} collapsible={false}>
        <DetailGrid
          cols={3}
          items={[
            { label: "Changed by", value: actor },
            { label: "When", value: fmtDateTime(item?.occurred_at), icon: HiClock },
            // Four of the five stores record no channel at all, so this says
            // so rather than implying the change came from nowhere.
            { label: "Changed from", value: where || "Not recorded" },
          ]}
        />
      </DetailSection>

      {/* Only when there is one. An absent reason is the norm on the legacy
          stores, and an empty "Reason: N/A" row reads like something is wrong. */}
      {item?.reason && <DetailText label="Why">{item.reason}</DetailText>}
    </DetailDialog>
  );
}
