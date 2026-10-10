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
//
// ─── THE 2026-10-10 PASS ───────────────────────────────────────────────────
// The two facts a reader actually arrives with, which the first build left
// them to work out:
//   · WAS IT A MOVE OFF THE DEFAULT, OR A MOVE BACK TO IT? The badge says so
//     in words, and the sentence under the pair says it again in context. This
//     is read off the catalogue's own `default` (`isDefaultValue`), so it
//     cannot drift from what a reset would actually do.
//   · WHY THERE IS NO REASON. An absent `reason` was simply a missing
//     section, which reads as "nobody said" when the truth is usually "we
//     never asked" — only a high-risk change is made to carry one. The
//     section is always there now and says which of the two it is.
// ─────────────────────────────────────────────────────────────────────────────

import { HiAnnotation, HiArrowRight, HiClock, HiPencilAlt, HiUser } from "react-icons/hi";
import DetailDialog, {
  DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailText,
} from "../components/DetailDialog";
import { fmtDateTime } from "../attendance/dates";
import {
  changeActorName, changeSourceLabel, displaySettingValue, isDefaultValue, moduleLabel,
} from "./settingsMeta";
import { settingBlurb, settingLabel } from "./settingsBlurbs";
import { CAPTION, TEXT } from "./settingsText";

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

  /* Which direction this change went, relative to the value we ship. It is
     the first thing an auditor wants and the hardest thing to see in a table
     of before-and-after pairs. */
  const blurb = settingBlurb(entry);
  const backToDefault = isDefaultValue(item?.new_value, entry);
  const movedOffDefault = !backToDefault && isDefaultValue(item?.old_value, entry);
  const direction = backToDefault
    ? "This put the setting back to the value we ship."
    : movedOffDefault
      ? "Until this change the setting was still on the value we ship."
      : null;

  return (
    <DetailDialog
      eyebrow={group?.label || moduleLabel(item?.group)}
      icon={HiPencilAlt}
      title={settingLabel(entry) || item?.setting_key}
      subtitle={fmtDateTime(item?.occurred_at)}
      /* One badge, the fact that is true of this record rather than of our
         plumbing: whether it is now back on the default. Where it was changed
         from is in "Who and when", where it belongs. */
      badge={backToDefault
        ? <DetailPill tone="soft">Back to the default</DetailPill>
        : movedOffDefault ? <DetailPill tone="outline">Moved off the default</DetailPill> : null}
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
        {/* What the setting DOES, in the same plain line the card under
            Company Settings prints (settingsBlurbs.js), and which way this
            change went. One shade, no colour. */}
        {(direction || blurb) && (
          <p className={`${CAPTION} mt-3`}>
            {[blurb, direction].filter(Boolean).join(" ")}
          </p>
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

      {/* A reason is only ASKED FOR on a high-risk change (the gateway's 422
          SETTINGS_REASON_REQUIRED), so "none recorded" is the normal case and
          needs saying — otherwise the gap reads as somebody declining to
          explain themselves. */}
      {item?.reason ? (
        <DetailText label="Why">{item.reason}</DetailText>
      ) : (
        <DetailSection title="Why" icon={HiAnnotation} collapsible={false}>
          <p className={`text-sm ${TEXT.body}`}>
            No reason was recorded. We only ask for one on the settings that can cost money or delete data.
          </p>
        </DetailSection>
      )}
    </DetailDialog>
  );
}
