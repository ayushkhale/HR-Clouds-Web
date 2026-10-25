# Unified badge counts — frontend integration (2026-10-26)

Front-end side of `GET /api/v1/inbox/badges` (#278) and the `pending_hr=true`
filter on API #133. The backend contract is in the three 2026-10-25 documents;
this file records only what the web client does with it, and the decisions a
later change should not undo.

---

## 1. What replaced what

| Before | After |
|---|---|
| `DashboardSidebar` fetched the inbox counts, the verification queue and a page of bank accounts itself | reads one snapshot |
| `HRInboxPage` fetched thirteen queue counts | reads the same snapshot |
| `ManagerApprovalsInbox` fetched leaves + five attendance/task counts | reads the same snapshot (and still loads the leave **list** it renders) |
| `DocumentVerificationPage` tiles counted the rows on the current page | reads the org-wide group from the same snapshot |

13–17 requests per HR page load became 1, and — the point of the exercise —
every badge on screen now comes from one response, so the sidebar and the page
it opens cannot disagree.

## 2. One owner: `shared/contexts/badgeCountsStore.js`

A module-level store with `useSyncExternalStore`, the same shape as
`employeeDirectoryStore.js`. **No screen calls `inboxAPI` directly.** Screens use
`useBadgeCounts()` (`shared/hooks/useBadgeCounts.js`), which returns
`{ counts, isUnavailable, sidebar, groups, plane, teamSize, syncedAt, loading,
refreshing, error, supported, refresh }`.

- The poller starts on the first subscriber and stops on the last; 60 s, and only
  while `document.visibilityState === "visible"`. On the legacy fallback it is
  180 s — one request may be re-read every minute, fifteen may not, or an
  un-upgraded server would be polled harder than it was before this change.
- Employee and guest workspaces ask for nothing: the store publishes
  `status: "unavailable"` and never issues a request for them.
- `loading` is the first read only: a background poll must never flicker a ready
  screen back to a skeleton.
- `refreshing` is **per component**, not the store's in-flight flag. The store has
  one read for the whole app, so spinning on that would spin every Refresh button
  in the tree once a minute unprompted, and swallow a press that landed in the
  window.
- `rateLimited` is the one thing that disables Refresh (§11: disabled is for what
  pressing cannot fix). The cooldown publishes its own expiry, because nothing
  else will — the poll is a no-op throughout it — and a button disabled on a flag
  that never changes is disabled for ever.

## 3. Decisions worth keeping

**The badge is the sum of the cards under it.** `sidebar.inbox_total` is the
server's sum of the twelve `total`s; the store sums the twelve numbers it is
actually showing instead. Two of them differ: tax declarations counts `submitted`
(below), and a category in `unavailable_categories` is not on screen at all. Same
arithmetic on both the unified and the legacy path, so the two sources agree too.

**Absent, not zero.** `meta.unavailable_categories` removes the card, the tile
and the badge rather than rendering `0` (CLAUDE.md §2). `isUnavailable(key)`
takes the screen's key and maps it to the dotted API key.

**A card counts exactly what its panel lists.** Tax declarations reads
`submitted`, not the API's `total` (= `submitted` + `under_review`), because the
embedded panel's status filter defaults to `submitted`. A card whose number does
not match the list under it is worse than no card. (`under_review` is
HR-actionable too — `canVerify` in `TaxDeclarationsPage` allows it — so the server
is right to put both in `total`; it is the panel's single-select status filter
that cannot express "either", which is why the client sums its own.)

**A panel's own count expires.** The open queue reports what it just listed, which
is newer than the snapshot for the moment between a decision and the re-read it
triggers. It is stamped with the time it was taken and dropped whole as soon as a
read lands, so a count from a panel that has since closed — or whose own reload
failed — can never pin a stale number to a card.

**The claims queue waits for the `pending_hr` answer.** Before the first read,
"does this server have the filter?" has no answer, and guessing means a list that
is either briefly too narrow or briefly far too wide. `usePagedList` is disabled
for that one case and the skeleton stays up — the same skeleton it would have been
showing anyway.

**Legacy fallback, latched per session.** A 404/501 flips `source` to `legacy`
and the old per-queue fan-out (`hrInboxCounts.js`, `managerInboxCounts.js`) runs
instead, for that session. Those two files are the emergency path now and nothing
new belongs in them — a queue added to the Inbox belongs in the badge endpoint.

**429 keeps the numbers.** `BADGE_SUMMARY_RATE_LIMITED` sets a cooldown from
`Retry-After` and leaves the last counts on screen; a rate limit is not something
the person reading a sidebar needs to be told about. Budget is 240/user/UTC-hour
and a 60 s poll spends 60 of them.

**`pending_hr` is gated on the badge endpoint answering.** An older server
*strips* the unknown param in silence and would return every claim ever filed, so
`PayrollReimbursementsPage` only sends it when `supported` is true and otherwise
falls back to `status=under_review` (today's behaviour). It is never sent
alongside `status` — the server refuses the pair with a 400.

## 4. Every queue wears its own number

Three badges used to carry all of this — Inbox, Bank Verification, Verification
Queue — and the other nine queues were silent, so a claim could sit for a day
with nothing in the menu to say so unless you opened the Inbox. Now that the
counts arrive together, each queue's link carries its own: Leave Requests,
Regularisations, Comp-offs, Employee Devices, Claims, Loans & Advances, Tax
Declarations and Letter Proposals for HR, and the manager's five time-and-leave
queues plus Flags (§2 — the same link, the same badge, in both workspaces).

`queueBadge(key)` in `DashboardSidebar.jsx` is the only way one is attached. It
renders nothing for 0 and nothing for a queue in `unavailable_categories`, so a
badge never appears on a page this role cannot act on.

**Section headers carry the total.** Most of the menu is collapsed most of the
time — it is the longest in the product — so a claim waiting inside a shut
PAYROLL section was invisible. The header sums the badges already on its own
links, so it can never claim something its children don't show, and it is drawn
as a plain dark number rather than a second red pill: the children carry the
alarm, the header carries the total.

## 5. One GET at a time per URL

`request()` in `shared/api/client.js` now **shares a GET that is already on the
wire** instead of issuing a second one. A page and the sidebar wanting the same
roster, a filter that settles one render after the list mounts, and React's
StrictMode running every effect twice in development all produced the same URL
twice, back to back, for an identical reply.

Nothing is cached — a call made after the previous one finished is a fresh
request. The rules that keep it safe:

- **A write ends every share.** Any non-GET empties the map, so a read issued
  after an approve or a save can never be answered by a read that left before
  it. That window is one request long, and it is exactly the window a decision
  lands in.
- A caller that passed its own `signal` or `headers` opts out: aborting somebody
  else's read, or handing them a reply shaped by headers they didn't send, is
  worse than a second request.
- Both callers get the same parsed object, as they already do wherever this app
  caches a read. Treat a response as read-only — it was never yours alone.

## 6. Decisions are pushed, not polled

Three new things hang off `shared/attendance/events.js`:

- `ATTENDANCE_EVENTS.DOCUMENT_VERIFICATION` and `ATTENDANCE_EVENTS.BANK_ACCOUNT`,
  both in `INBOX_EVENT_KINDS`. Neither is part of `inbox_total` — each has its own
  sidebar badge — but both empty a queue, and the Verification Queue badge had
  never cleared without a reload (CLAUDE.md §7).
- The store is now the **only** subscriber to `INBOX_EVENT_KINDS`: one debounced
  re-read refreshes every number at once.
- That re-read is **forced**. The 5 s floor between reads is honoured by waiting
  it out rather than dropping the read, and a decision that lands while a poll is
  already on the wire queues a second read behind it — that reply was composed
  before the decision and cannot show the result.

## 7. Deliberately not changed

- `NotificationsContext` still owns the bell count. It makes optimistic writes
  (mark-as-read) that the badge snapshot cannot see, so `sidebar.notifications_unread`
  is ignored.
- `MyRequestsPage` and `DocumentRequestsPage` tallies stay local: they are scoped
  to the filters on screen, the badge is plane-wide.
- `BankVerificationPage` tiles stay local: they derive from rows the page loads
  anyway and double as filters.
