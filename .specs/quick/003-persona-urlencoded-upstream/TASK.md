# Quick Task 003: send persona writes to the proxy as urlencoded

**Date:** 2026-07-30
**Status:** Done — this is the half that makes Identity work **without** waiting
for a proxy deploy.

## Description

The admin Identity tab's saves failed with
`{"error":"\"tenant_id\" is required and must be a UUID","status":400}`. The defect
is in crab-shell-proxy — `handleAdminPersonaPost` called `ParseForm` on the
multipart body this BFF was sending, and `ParseForm` fills `r.Form` from the query
string alone (leaving it non-nil, so the later `FormValue` calls never parsed the
body). Full diagnosis:
`crab-shell-proxy/.specs/features/persona-injection/multipart-parse-fix-report.md`.

The proxy fix cannot reach the user until that image is rebuilt and redeployed. The
BFF leg can, today: the deployed handler reads urlencoded bodies perfectly well.

## What changed

`app/api/admin/persona/route.ts` (POST) — the **upstream** leg now sends
`application/x-www-form-urlencoded` instead of a multipart `FormData`. These are
text fields with no file part, so nothing is lost.

The browser→BFF leg is untouched: `savePersona` still posts a `FormData`, which
`req.formData()` parses as before. `lib/adminPersona.ts` needed no change.

The proxy fix was **widened** to accept both encodings for exactly this reason:
`ParseMultipartForm` calls `ParseForm` first and only then fails with
`ErrNotMultipart`, so tolerating that one error takes either body in a single call.
Both encodings now have live clients, and neither repo's deploy order can break
Identity again.

## Verification

- Suite 415 tests pass; `tsc --noEmit` clean; `yarn build` passes.
- **End-to-end against the served build**, with `MYCELIUM_INTERNAL_URL` pointed at
  a local echo server: posting the panel's multipart form to
  `/api/admin/persona?restart=notice` made the BFF send

  ```
  POST /alpha/v1/admin/persona?restart=notice
  content-type: application/x-www-form-urlencoded
  scope=tenant&tenant_id=1111…&agent=alpha&name=AGENT.md&body=%23+quem+voc%C3%AA+%C3%A9
  ```

  — every field present, UTF-8 intact, bearer attached, restart policy still on the
  query where the proxy reads it.
- The proxy side has a matching test (`TestAdminPersonaPostUrlencoded`) plus one
  proving a JSON body is still refused with no write.

## Still not verified

Neither half has run against the real gateway — there is no stack up here. The
remaining check is a save from the Identity tab against a deployed proxy, old or
new; the echo-server test above proves the request the BFF now emits, not the
gateway's answer to it.
