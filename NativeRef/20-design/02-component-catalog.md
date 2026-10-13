# 02 · Component catalog

Every primitive in `src/ui/`, its web ancestor, its props, and the rule it
exists to enforce. Source for all of them: [50-starter/src/ui/](../50-starter/src/ui/).

**If a component is in this list, don't rebuild it.** The web app lost weeks to
eight divergent copies of a status badge and nine copies of a day-count
formatter.

---

## Layout

### `Screen`

The shell every screen sits in. Handles safe areas, the 16px gutter,
pull-to-refresh and keyboard avoidance so no screen does it itself.

```jsx
<Screen
  title="My Attendance"           // sets the native header title
  scroll                          // false for a FlatList screen (it scrolls itself)
  refreshing={list.loading}
  onRefresh={list.reload}
  footer={<Button …/>}            // pinned above the safe area
>
```

| Prop | Type | Note |
|---|---|---|
| `title` | string | Must equal the tab label and the screen's own `h1` |
| `scroll` | bool | Default `true`. **`false` when the child is a `FlatList`** — nesting a list in a ScrollView kills windowing |
| `refreshing` / `onRefresh` | | Pull-to-refresh on every list and dashboard |
| `footer` | node | Pinned; respects the home indicator |
| `edges` | array | Safe-area edges, default `['top','bottom']` |

### `Card`

```jsx
<Card>…</Card>
<Card tone="hero" />      {/* radius xl, shadow md */}
<Card padded={false} />   {/* for a card that holds a list */}
```

Web ancestor: `bg-white rounded-3xl p-6 shadow-xs border border-slate-100`.

### `PageHeader` — the purple hero

The app's signature. Web ancestor: `shared/components/PageHeader.jsx`.

```jsx
<PageHeader
  badgeText="Tuesday, 13 October"
  badgeIcon={icons.calendar}
  title={`Good morning, ${firstName}`}
  subtitle="Here’s your day at a glance"
  right={<ShiftChip shift={shift} />}
/>
```

Rules carried over from web, all of them deliberate:

- **Fixed height**, not aspect-driven. The web version was sized by width once,
  and the three roles ended up with banners of three different heights "for no
  reason anybody chose". Here: `minHeight: 132`.
- New header information goes **inside** this, never above or below it.
- Decorative art is `accessibilityElementsHidden` — it carries nothing the
  heading doesn't, so it gets no made-up description.
- Only the **Home** screen gets one. Other screens use the native header plus an
  `h1`, exactly as the web app does.

### `Divider` · `Spacer`

Trivial, but they stop `marginBottom: 13` appearing in a screen file.

---

## Lists and rows

### `Row` — the pressable list row

The native `rowPreviewProps`. The row is the **only** way into a detail.

```jsx
<Row
  onPress={() => setSelected(item)}
  accessibilityLabel="Loan details"
  left={<Avatar person={item} size={36} />}
  title={personName(item)}
  subtitle={`${employeeCode(item)} · ${fmtDate(item.date)}`}
  value={formatMoney(item.amount)}
  badge={<StatusBadge kind="compoff" status={item.status} />}
/>
```

| Prop | Note |
|---|---|
| `onPress` | **Omit it** for a row that opens nothing — the row then has no press feedback at all, rather than a dead press |
| `title` / `subtitle` | Two lines maximum. Everything else belongs in the sheet |
| `value` | Right-aligned, tabular |
| `badge` | A `StatusBadge` or `Pill` |
| `actions` | Real actions only (Cancel, Download). **Never a View / eye / Review button** |
| `disabled` | Dims and removes the press |

Press feedback is `color.brandSoftBg` at 40% — the native equivalent of
`hover:bg-purple-50/40`.

### `ListFooter`

Pagination state and the "N records" line. Web ancestor: `Pagination` in
`attendance/ui.jsx`.

```jsx
<ListFooter page={list.page} totalPages={list.totalPages} total={list.total}
            limit={list.limit} onPageChange={list.setPage} noun="day" />
```

`noun` exists because the dense attendance history endpoints **paginate over
calendar days, not records** — "30 records" for September would be a lie.

On mobile, prefer **infinite scroll** (`onEndReached` → `setPage(p => p+1)`) and
let this render only the trailing count. Keep the prop-compatible numbered mode
for short lists where jumping pages is genuinely useful.

### `EmptyState`

```jsx
<EmptyState icon={icons.gift} title="No earned leave yet"
            message="Days you work on a weekly off or a holiday appear here once your manager approves them."
            action={<Button variant="soft" title="See my attendance" onPress={…} />} />
```

Two rules: it says **what to do next**, and "none yet" is worded differently
from "none match this filter".

### `ErrorState`

```jsx
<ErrorState error={list.error} onRetry={list.reload}
            fallback="Couldn’t load your attendance." />
```

Branches on `isFeatureDisabled(error)` → the "isn't enabled" state with **no
retry button**, because retrying cannot help. Branches on offline → different
copy, no error detail. Otherwise the mapped message plus Try again.
`accessibilityRole="alert"`.

### `Skeleton`

```jsx
<Skeleton type="rows" rows={5} />   {/* list */}
<Skeleton type="card" />            {/* a single card */}
<Skeleton type="dashboard" />       {/* hero + tiles + chart */}
<Skeleton type="sheet" />           {/* sheet body */}
```

The shape of the real content, never a centred spinner. A refresh of an
already-loaded list keeps the rows visible and shows the refresh control
instead.

---

## Status and labels

### `StatusBadge`

One badge, app-wide. Pill, coloured dot, **and a word** — colour alone never
carries the status.

```jsx
<StatusBadge kind="record" status={record.status} />
<StatusBadge kind="compoff" status="earned" />      // → "Waiting for approval"
<StatusBadge kind="anomaly" status={anomalyStatusKey(a)} />
```

`kind`: `record` · `regularization` · `compoff` · `overtime` · `anomaly` ·
`severity`. It resolves label and tone through `statusMeta(kind, status)` in
`lib/enums.js`, so an unknown status falls back to `humanize()` and a slate
tone — never a crash, never a raw enum.

### `Pill`

```jsx
<Pill tone="soft">Increment</Pill>     // soft | solid | outline | muted
```

Purple only. Web ancestor: `DetailPill`.

### `HelpLabel`

A label with its ⓘ attached, grouped so the icon can never wrap onto its own
line and make the host taller.

```jsx
<HelpLabel text="Income tax so far"
           help={{ surface: 'payroll.tax_summary', field: 'tds_ytd' }} />
```

Renders the plain text when the config has no entry for this workspace — which
is what makes it safe to wire by data key everywhere.

### `InlineAlert`

```jsx
<InlineAlert tone="amber">Recorded 1.4 km from Tata Steel Pune. …</InlineAlert>
```

Tones: `rose` · `amber` · `emerald` · `sky` · `slate` (the web's names, rendering
purple). `role="alert"` for rose, `role="status"` otherwise.

### `FieldError`

One line, rose, 11px, under a field. Wired to the `errors` map from
`lib/validation.js`.

---

## Tabs and filters

### `FilterTabs`

Segmented control. Web ancestor: `FilterTabs` in `attendance/ui.jsx` — "tabs
left, search right, counts in labels". A plain picker of options **was
rejected**.

```jsx
<FilterTabs options={ANOMALY_FILTERS} value={status} onChange={setStatus} />
```

- Scrolls horizontally when the options don't fit, with edge fades.
- Counts go **in the label** (`"Pending (3)"`), never in a separate badge.
- `accessibilityRole="tablist"` on the container, `"tab"` on each.
- **Never put a `FieldHelp` inside this** — nested controls are invalid and a
  tap would fire both. Put the ⓘ beside the strip.

### `TabStrip`

The horizontally scrolling tab bar for a screen with sub-screens (Time module,
Profile, Payslips).

Web ancestor: `ProfileTabStrip`, and its header comment is a warning: a wrapped
bar grew to three rows on a laptop, and a bare scroll strip hid the last tabs.
So the strip carries **arrows, edge fades, and scroll-the-selected-tab-into-
view**. On mobile, drop the arrows (swiping is natural) but keep the fades and
the auto-scroll.

**Never turn it back into a wrapping row.**

### `MonthStepper`

```jsx
<MonthStepper year={year} month={month} onChange={setPeriod} />
```

`‹ September 2026 ›`. Forward is **disabled** past the current month
(`isFutureMonth`). Labels from `monthLabel()` / `monthLabelShort()`.

---

## The record sheet

### `RecordSheet` — the house standard for every popup showing data

Web ancestor: `DetailDialog`. Built on `@gorhom/bottom-sheet`.

```jsx
<RecordSheet
  eyebrow="Earned leave"
  icon={icons.gift}
  title="Worked Sunday, 5 October"
  subtitle="Credited 1 Day"
  badge={<StatusBadge kind="compoff" status={row.status} />}
  loading={state.loading}
  onClose={() => setSelected(null)}
  footer={<Button title="Cancel request" variant="danger" onPress={…} />}
>
  <SheetStats items={[…]} />
  <SheetSection title="How it was worked out">…</SheetSection>
</RecordSheet>
```

| Prop | Note |
|---|---|
| `eyebrow` | 10px uppercase purple above the title |
| `icon` | In a purple-50 rounded square |
| `title` / `subtitle` | Through `displayValue()` — "N/A", never a dash |
| `badge` | Right of the header |
| `loading` | Shows `Skeleton type="sheet"`, keeps the header |
| `footer` | **Actions live here, not on the row.** Pinned, above the safe area |
| `snapPoints` | Default `['55%','92%']`. **92% max** — the list must stay visible behind it |

Mechanics worth keeping:

- **Android back closes the topmost sheet only**, one press at a time.
- Several sheets can stack (a cost preview over a rule). Only the topmost
  responds to back / Escape.
- The ⓘ popover and Maya render through a **portal**, so they are not children
  of the sheet and cannot be clipped by it.
- Focus returns to the row that opened it.

### `SheetStats`

Headline numbers. 2 across on a phone (web goes to 4).

```jsx
<SheetStats items={[
  { label:'Still to repay', value: formatMoney(outstanding(loan)), icon: icons.cash,
    help:{ surface:'payroll.loans', field:'outstanding_principal' } },
]} />
```

### `SheetSection`

```jsx
<SheetSection title="Deductions (₹17,568)" defaultOpen={false}
              help={{ surface:'payroll.statutory', field:'employee_pf' }}>
```

- Long or secondary sections start **folded**, with the total in the title.
- `collapsible={false}` pins one open.
- The ⓘ sits in the header's right-hand area, **never inside the fold toggle** —
  a tap would collapse the section.
- A `help` with no entry for this workspace renders **nothing**, not an empty
  12px slot that shifts the title.

### `SheetGrid`

Label-above-value, the same look as a read-only form field.

```jsx
<SheetGrid cols={2} items={[
  ['Effective from', fmtDate(s.effective_from)],
  { label:'CTC', value: formatMoney(s.ctc), help:{ surface:'payroll.my_salary', field:'ctc' } },
  { label:'Reason', value: s.revision_reason, wide: true },
]} />
```

- **Max 2 columns on a phone** (web's max is 4). `cols={1}` for long values.
- `wide: true` spans both columns.
- Accepts `[label, value]` tuples or objects.
- Every box in a row is as tall as the tallest — a wrapping address next to a
  pincode must not leave a ragged row.

### `SheetTable`

Line items — payslip components, loan instalments, declaration rows.

```jsx
<SheetTable
  columns={[
    { header:'Month', render: r => formatPeriod(r.period_month) },
    { header:'Amount', align:'right', render: r => formatMoney(r.amount),
      help:{ surface:'payroll.loans', field:'installment_amount' } },
  ]}
  rows={installments}
  empty="No instalments scheduled."
/>
```

**Scrolls horizontally inside a bordered container** rather than squeezing
columns. An empty cell renders a muted "N/A". ⓘ goes on the **header**, never
per row.

### `SheetText`

Reasons and notes. Preserves line breaks, wraps long words, muted when empty.

### `SheetFooterNote`

Says **why** there are no actions, instead of an empty footer:

```jsx
<SheetFooterNote>Approved leave can’t be changed. Ask your manager to cancel it for you.</SheetFooterNote>
```

---

## Forms

### `FormSheet`

A multi-field form is a **full-screen modal screen**, not a half-sheet. Web
ancestor: the Create Attendance Policy dialog — `max-w-5xl`, `max-h-[92vh]`,
uppercase 11px labels, pinned footer.

```jsx
<FormSheet title="Request a correction" onClose={…}
           footer={<><Button variant="ghost" title="Cancel" …/><Button title="Send request" …/></>}>
  <Field label="Date" help={{ surface:'attendance.regularization', field:'date' }}>
    <DateField value={form.date} onChange={…} max={todayYMD()} />
  </Field>
</FormSheet>
```

**A form must not make the user scroll to find the submit button** — the footer
is pinned, always visible, and the body scrolls under it.

House rule from web, adapted: four or more fields means **gridded**. On a phone
that is a two-column grid for short fields (date, time, amount, toggle) and
full-width for long ones (person pickers, reason boxes). `max-w-md`-style
cramping is a bug, not a style.

Single-field confirms, reason prompts and person pickers stay as **compact
sheets** — a form is not a record inspector, and a confirm is not a form.

### `Field`

Label + ⓘ + control + error, in the app's signature arrangement.

```jsx
<Field label="Reason" help={{ surface:'attendance.regularization', field:'reason' }}
       error={errors.reason} required>
  <TextField multiline value={form.reason} onChangeText={…} maxLength={1000} />
</Field>
```

The ⓘ sits **beside** the label in a row, never inside it — inside, it becomes
part of the input's accessible name ("Reason What is a reason?").

### `TextField` · `Select` · `Toggle`

Standard controls on the token system. `Select` is a bottom-sheet picker, not a
native dropdown — the web app explicitly rejected native `<select>` styling
because it ignored the corner radius.

### `TimeField`

**Never a raw text input for a time**, and never a free-text `HH:mm`. Web
ancestor: `TimeField` ("never `<input type="time">`").

```jsx
<TimeField value={form.requested_clock_in} onChange={…} />   // "HH:mm", 24h
```

Wraps `@react-native-community/datetimepicker`. Emits `"HH:mm"` — a **wall
clock**, never timezone-converted, because a shift time is a schedule, not an
instant.

### `DateField`

Emits `"YYYY-MM-DD"` via `toLocalYMD()` — **never** `toISOString()`, which
shifts the date west of UTC and is a 400 on the endpoints that demand a strict
date.

### `PersonSelect`

Searchable sheet over `useDirectory()`. **Never a plain list of ids.** Shows
`Avatar` + name + `employee_code`; a name that hasn't loaded reads "Loading…".

Rarely needed in the employee app (you don't pick other people), but it exists
for the manager phase and for any "share with" flow.

---

## People

### `Avatar`

**Never hand-roll initials or a bare `<Image>`.** Web ancestor: `GenderAvatar`,
whose resolution order is:

1. A real photo URL (`src`, or found on `person` — e.g. `avatar_url`). If it
   fails to load, **fall through** rather than showing a broken image.
2. The generic male / female illustration, from the person's gender.
3. Purple initials when gender is unknown.

```jsx
<Avatar person={row} size={36} onPhotoError={refreshDirectoryPhotos} />
```

`onPhotoError` matters: `avatar_url` is a **presigned link that dies in ~5
minutes** (T21), so a screen left open must refetch rather than drop everyone to
the fallback illustration.

### `PersonRow`

Avatar + name + `employee_code` (+ an optional second line). Never a UUID. Web
ancestor: `PersonCell`.

---

## Feedback

### `Toast` + `ToastProvider`

```jsx
const { showToast } = useToast();
showToast('Correction request sent', 'success');     // success | error | info
```

- Top of the screen, under the status bar, `layer.toast` (200).
- Success/info 4 s, errors 6 s (an error needs longer to read).
- `accessibilityLiveRegion="polite"`, `role="status"` / `"alert"`.
- One at a time; a new one replaces the old.

### `ConfirmProvider` — the awaitable confirm

The native answer to the web's `window.confirm` override. On web, ~20 unawaited
calls fired their API **before the user pressed OK**.

```jsx
const confirm = useConfirm();
if (!(await confirm({
  title: 'Cancel this leave?',
  message: 'Your balance will be given back.',
  confirmText: 'Cancel leave',
  destructive: true,
}))) return;
```

**Every destructive action awaits this.** No exceptions.

### `ReasonPrompt`

A confirm that collects a reason (claim cancellation, correction withdrawal).
Compact sheet, one field, `layer.reasonPrompt` (170) so it sits **above** a
record sheet. Rendered as a **sibling** of the sheet, not a child.

### `AttachmentViewer`

Images inline with pinch-zoom; PDFs handed to the OS viewer via
`blob-util` + `file-viewer`. `layer.attachmentViewer` (165). **No webview.**

Always fetches a **fresh** `view-url` on open — the previous one has expired
(T21), and the server sends `Cache-Control: private, no-store` precisely so a
preview is re-fetched rather than remembered.

---

## Field help

### `FieldHelp`

The ⓘ. Toggletip (not a tooltip — it contains a button), portalled, keyboard
reachable, with the Ask Maya link when the config says so.

```jsx
<FieldHelp surface="payroll.bank_details" field="ifsc_code" label="an IFSC code" />
<FieldHelp … tone="onDark" />    {/* on the purple hero */}
<FieldHelp … overlay />          {/* zero-width: draws in existing padding */}
```

No entry for this surface / field / workspace → **renders nothing**. That is
what makes it safe to wire into a shared component.

Full rules: [30-domain/08-field-help.md](../30-domain/08-field-help.md).

---

## Buttons

### `Button`

```jsx
<Button title="Clock in" onPress={…} variant="primary" loading={busy} fullWidth />
```

| Variant | Look | Use |
|---|---|---|
| `primary` | purple-600 fill, white text | The one main action |
| `soft` | purple-50 fill, purple-700 text | Secondary |
| `outline` | white, purple-300 border | Tertiary |
| `ghost` | transparent, slate text | Cancel, dismiss |
| `danger` | rose-500 fill, white text | Clock out, delete, cancel a request |
| `breakStart` | white, indigo-100 border, indigo-700 text | Start break |
| `breakEnd` | indigo-600 fill | End break |

- Height 48 for a primary action, 40 for inline. Minimum tap target 44.
- `loading` shows a spinner **and keeps the label** — a button that loses its
  text looks broken.
- Disabled is 60% opacity, and **never** disabled for a reason the UI hasn't
  explained.
- Press: scale to 0.98 (`HOVER.lift`'s native equivalent), skipped under
  reduce-motion.

The exact variants above are lifted from `AttendanceCard` so the punch card
reads identically.

---

## What is deliberately NOT here

| Not provided | Why |
|---|---|
| A generic `Modal` | Data → `RecordSheet`. Forms → `FormSheet`. Confirms → `useConfirm`. There is no fourth case, and a raw `Modal` is lint-banned |
| A `Table` | A phone has no tables. Lists are rows; line items are `SheetTable` |
| A `Tooltip` | The ⓘ is a toggletip. A hover tooltip has no meaning on touch |
| An `Accordion` | `SheetSection` is the collapsible, and it belongs in a sheet |
| A chart wrapper | Two charts, both from `gifted-charts` with `theme.chart` colours. A wrapper would hide the one place colour choices must be visible |
| A `DatePicker` modal of our own | `DateField` wraps the platform picker. People already know it |
