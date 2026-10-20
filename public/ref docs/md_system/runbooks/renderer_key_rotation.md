# Runbook — PDF Renderer API Key Rotation

**Owner:** Ops / Security
**Applies to:** `x-api-key` between HRMS and the `pdf-generation` renderer (F-1, D-14, EC-44)
**Related:** [`renderer_outage.md`](renderer_outage.md) · [`pdf_retention_purge.md`](pdf_retention_purge.md)

---

## Why a two-key window

The renderer accepts requests authenticated with **either** `PDF_RENDERER_API_KEY` (current) or
`PDF_RENDERER_API_KEY_PREVIOUS` (previous). Comparison is constant-time (SHA-256 digest +
`crypto.timingSafeEqual`). This dual-key window is what makes rotation **zero-downtime**: there is a
period where both the old and the new key are valid, so HRMS is never sending a key the renderer
rejects.

**The order below is the whole point.** Doing the final step (clearing the previous key) before HRMS
has been switched to the new key is exactly the outage EC-44 describes.

## Rotation procedure (zero failed renders)

```
1. Generate a NEW key.

2. Renderer env:
     PDF_RENDERER_API_KEY_PREVIOUS = OLD
     PDF_RENDERER_API_KEY          = NEW
   Deploy the renderer.
   -> Both keys valid. HRMS still sends OLD. Zero failures.

3. HRMS env:
     PDF_RENDERER_API_KEY = NEW
   Deploy / restart HRMS.
   -> HRMS now sends NEW. Both still valid. Zero failures.

4. VERIFY (see below) before proceeding.

5. Renderer env: clear PDF_RENDERER_API_KEY_PREVIOUS.
   Deploy the renderer.
   -> OLD is now dead. Rotation complete.
```

## Verification (between step 3 and step 5)

- `GET /api/v1/documents/hr/jobs/pdf-render/health` (`#151`): `renderer.authenticated = true`.
  This field reflects `Boolean(config.apiKey)` on the HRMS side — it is the answer to "is the release
  blocker closed in this environment?" and the one field to check after a rotation.
- Issue a real preview / single letter — it renders (`renderer_version` non-null on the new artifact).
- `#151` `failure_rate` is unchanged from before the rotation.

Only after all three pass do you run step 5.

## If something goes wrong

- **HRMS renders start failing `503 renderer_auth` after step 5:** you cleared the previous key before
  HRMS was actually sending the new one. **Recover by setting `PDF_RENDERER_API_KEY_PREVIOUS` back to
  the key HRMS is currently sending** and redeploying the renderer. **Never** deploy a renderer with
  auth disabled to recover — that reopens release blocker D-14.
- **Renderer serves `503` to everyone:** no key is configured on the renderer at all. Set
  `PDF_RENDERER_API_KEY` and redeploy. (`ALLOW_UNAUTHENTICATED=true` is for local development only and
  must never be set in a deployed environment.)

## Cadence

Rotate on the organisation's standard secret-rotation schedule, and immediately on any suspected key
exposure. Each rotation is independent and follows the same five steps.
