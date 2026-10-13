# 04 · Error handling

**Never show a raw error to a person.** Every failure goes through its domain's
error module, which turns a machine code into a sentence that says what happened
and what to do next.

The modules are ported whole into `50-starter/src/lib/errors/`. They are the
accumulated result of real support tickets — don't rewrite them, extend them.

---

## The two error shapes

| Family | Code key | Read with |
|---|---|---|
| Attendance, leave | `err.data.code` | `attendanceErrorMessage()`, `leaveErrorMessage()` |
| Payroll, documents, billing, settings, organisation | `err.data.errorCode` | `payrollErrorMessage()`, `documentErrorMessage()` |

Both are read by the ported modules, so you never have to remember which.
**Always branch on the code, never on the message** — messages are not stable
and change without notice.

```js
// api/client.js shapes every failure identically
const error = new Error(data?.message || `Request failed (${status})`);
error.status    = response.status;
error.data      = data;              // { success:false, message, code|errorCode, details? }
error.retryAfter = …;                // when Retry-After was finite
throw error;
```

---

## The one pattern, everywhere

```jsx
import { attendanceErrorMessage, isFeatureDisabled } from '@/lib/errors/attendanceErrors';

if (list.error) {
  return <ErrorState error={list.error} onRetry={list.reload}
                     fallback="Couldn’t load your attendance." />;
}
```

`ErrorState` does three things in order:

1. If `isFeatureDisabled(error)` → the "Attendance isn't enabled" state, with
   the module's own wording. This is a **403 with `FEATURE_NOT_AVAILABLE`**, not
   a 404, and it is not an error the person can fix by retrying — so no
   "Try again" button.
2. Otherwise → `attendanceErrorMessage(error, fallback)` and a Try again.
3. Always `accessibilityRole="alert"`.

For a **write** failure, show a toast rather than replacing the screen:

```js
try {
  await attendanceAPI.clockIn(payload);
  emitAttendanceChanged(ATTENDANCE_EVENTS.PUNCH);
} catch (e) {
  if (isStateReconciliation(e)) {
    // ALREADY_CLOCKED_IN / NOT_CLOCKED_IN / NO_ACTIVE_BREAK — the server and
    // the screen disagreed about reality. The server is right. Refresh quietly
    // in slate, not rose: nothing the person did was wrong.
    await refresh();
    setNotice({ text: attendanceErrorMessage(e), tone: 'slate' });
  } else {
    showToast(attendanceErrorMessage(e), 'error');
  }
}
```

That `isStateReconciliation` branch matters. "You're already clocked in" is not
a failure — it means another device punched first. Red for that is a lie.

---

## Resolution order inside a module

```
1. a mapped code                      → our copy (most specific, most actionable)
2. a code in SERVER_MESSAGE_CODES     → the server's message verbatim
                                        (VALIDATION_ERROR and friends carry
                                         specifics we cannot write in advance)
3. err.message, if it looks human
4. the caller's fallback
5. "Something went wrong. Please try again."
```

Step 2 is deliberate. A `VALIDATION_ERROR`'s message is the first Joi problem
("`account_type` must be one of [savings, current]"), which beats any generic
sentence. Payroll gap G-1 adds `details: [{ path, message }]` with *all* of
them — show those against the fields when you have them.

**Two codes carry object-shaped `details`, not arrays** — `CSV_PARSE_FAILED`
and `BULK_VALIDATION_FAILED`. Always branch on the code before reading
`details`. Neither occurs in the employee app, but the helper guards for it.

---

## Codes an employee will actually hit

### Access and gating (all families)

| Code | HTTP | Copy direction |
|---|---|---|
| `FEATURE_NOT_AVAILABLE` | 403 | "<Module> isn't enabled for this organisation. Contact your administrator to turn it on." No retry |
| `MISSING_ORG_CONTEXT` | 403 | "…only available inside an organisation." |
| `FORBIDDEN` | 403 | "You don't have permission to perform this action." Shouldn't happen — if it does, you rendered a control you shouldn't have |
| `UNAUTHORIZED` | 403 | Cross-org access. "This record belongs to a different organisation." |

> A `FORBIDDEN` reaching an employee screen is a **bug in your UI**, not a thing
> to handle gracefully. House rule §2: never show a button that 403s.

### Punch

| Code | HTTP | Meaning | Treat as |
|---|---|---|---|
| `ALREADY_CLOCKED_IN` | 409 | Another device got there first | **Reconciliation** — refresh, slate note |
| `NOT_CLOCKED_IN` | 400 | Clock-out or break with no open record | **Reconciliation** |
| `NO_ACTIVE_BREAK` | 400 | Break-end with no open break | **Reconciliation** |
| `MAX_BREAKS_EXCEEDED` | 400 | Policy limit reached today | Error toast |
| `PREVIOUS_SHIFT_OPEN` | 409 | Yesterday's overnight record still open | Error toast: clock out of it first |
| `PERIOD_LOCKED` | **403** | Date inside a payroll lock | Error toast: contact HR |

**`PERIOD_LOCKED`, not `DATE_LOCKED`. 403, not 409.** `DATE_LOCKED` never
existed; any handling for it is dead code.

### Corrections

| Code | HTTP | Note |
|---|---|---|
| `REGULARIZATION_DISABLED` | 403 | Policy forbids corrections entirely |
| `INVALID_REGULARIZATION_DATE` | 400 | Outside the policy's window |
| `INVALID_REGULARIZATION_WINDOW` | 400 | Clock-out not after clock-in |
| `INVALID_REGULARIZATION_TIME` | 400 | Unparseable time |
| `ALREADY_PENDING` | 409 | One pending request per date |
| `ALREADY_PROCESSED` | 400 | No longer `pending` — refresh the list |
| `WORK_MODE_NOT_PERMITTED` | 400 | Contract doesn't allow that mode. The **server's** message names the next step — show it verbatim |
| `INVALID_WORK_MODE` | 400 | Not a recognised mode |

### Leave

Most leave business-logic 400s (overlap, sandwich rule, no working days in the
range) already carry **clear server messages** — they fall through to step 2 on
purpose. The mapped ones that matter to an employee:

| Code | Note |
|---|---|
| `DOCUMENT_REQUIRED` | This many days of this type needs evidence. Attach and resubmit |
| `DEMOGRAPHIC_INELIGIBLE` | "You are not eligible to apply for this leave type." |
| `DEMOGRAPHIC_PROFILE_INCOMPLETE` | A profile detail (e.g. gender) isn't on file → contact HR |
| `NOTICE_PERIOD_RESTRICTED` | Restricted during notice period |
| `LEAVE_CONFIG_ENDED` | Their policy ended before that date |
| `NOT_FOUND` | "That leave record could not be found… refresh to see the latest." |

### Pay

| Code | Note |
|---|---|
| `VALIDATION_ERROR` | Show the server's message; with `details[]`, show each against its field |
| `PAYSLIP_NOT_RELEASED` / `403` on a payslip PDF | A held payslip. Use `payslipDownloadMessage()` — it says "not released yet", never "not found" |
| `PERIOD_LOCKED` | Attendance locked by an approved run |
| `ATTACHMENT_*` | Upload lifecycle — usually "the file didn't finish uploading, try again" |

The payroll map is ~120 codes deep because HR needs them. An employee sees a
handful; the module still carries them all, so a surprise code never shows raw.

### Documents

| Code | Note |
|---|---|
| `DOCUMENT_NOT_FOUND` | **The uniform denial** for every `…/documents/:id` route — missing, another org, outside your team, confidential, or not yours. The wording must **not** guess which: "This document isn't available any more…" |
| `REQUEST_NOT_FOUND` | The Phase-4 twin for `…/document-requests/:id`. Both read the same to the user |
| `CATALOG_ENTRY_NOT_FOUND` / `_INACTIVE` | Refresh; **nothing was activated** |
| `DOCUMENT_TYPE_NOT_ACTIVATED` | HR hasn't switched the type on |

> `TEMPLATE_NOT_FOUND` is **overloaded**: a blank company form in Phase 5, a
> letter template in PDF Phase 1. Letter screens call `letterErrorMessage()`.
> The employee app only ever means the blank form, so the default map is right —
> but don't "unify" the two.

### Transport

| Status | Treat as |
|---|---|
| `408` + `isTimeout` | "Request timed out. Please try again." Retryable |
| `429` | "Too many attempts. Try again in N seconds." **Never auto-retry a write** |
| `5xx` | Generic + Try again. Don't guess at the cause |
| HTML body | A gateway error. The status is the truth; there is no code to read |
| Network error (no response) | "You appear to be offline." Different copy from a server error |

---

## Offline vs server error — they are not the same news

```js
import NetInfo from '@react-native-community/netinfo';

// In ErrorState:
const offline = !useNetInfo().isConnected;
// offline  → "You’re offline. Reconnect and try again."   (no error detail)
// online   → the mapped message                            (+ Try again)
```

Showing "Couldn't load your payslips" when the phone has no signal sends people
to support for a problem they can see on their own status bar.

---

## Validation errors on forms

Client-side first, through `lib/validation.js`. Each validator returns
`{ errors, payload }` — `errors` maps field → message, `payload` is the exact
body to send.

```js
const { errors, payload } = validateRegularization(form);
if (hasErrors(errors)) { setErrors(errors); return; }
await attendanceAPI.submitRegularization(payload);
```

Rules the backend does **not** enforce (so these validators are the only guard):
half-day ≤ full-day thresholds, per-shift-type times, rotation cycle sums. And
remember unknown keys are **silently stripped** — a payload must never carry a
key the schema doesn't declare, because you'll never be told.

Server-side errors land on fields when `details[]` gives a `path`; otherwise
they go in an `InlineAlert` above the footer, never in a toast that disappears
while the person is still reading the form.

---

## What never appears on screen

- A raw `code` or `errorCode`.
- A Joi message that mentions a database column (`"user_id" is required`) —
  if one slips through, that's a mapping gap: add the code to the module.
- A stack trace, a URL, a status number on its own ("Error 422").
- The word "null", "undefined", "NaN" or "[object Object]".
- A UUID, in any error copy. Even in a toast. Even in an accessibility label.

---

## Adding a code

1. Confirm the code exists — `public/ref docs/` §"error codes" for the module.
   **If a code isn't on the module's verified list, the backend doesn't emit
   it**; don't map imaginary codes.
2. Add it to the map with copy that says the consequence and the next step.
3. If the server's own message is more specific than anything you can write,
   add the code to `SERVER_MESSAGE_CODES` instead.
4. If it needs a different *shape* of response from the UI (reconcile, retry
   with a fresh key, stop), add a predicate (`isStateReconciliation`,
   `isFeatureDisabled`) — **don't** make screens string-match the message.
