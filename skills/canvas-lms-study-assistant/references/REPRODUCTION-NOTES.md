# Sanitized implementation results and acceptance checklist

Source-case observations through 2026-10-14; published 2026-10-15. No student names, account/store/project IDs, course text, real course/file/task IDs, credentials or signed URLs are included. Assets are sanitized original code, not a public copy of the private deployment's runtime data.

## What was actually demonstrated

| Capability | Source-case result | Reproduction requirement |
|---|---|---|
| Ordinary iPhone Chat connector | User-reported actual API and forced-browser calls succeeded | Retest with the new user's account/app; desktop success alone is insufficient |
| API content | Real courses, module items, full page HTML/text, assignments, announcements, published grade/submission fields and Inbox returned | Compare each content type with authorized web view; empty fields are not fabricated feedback |
| Attachments | Real PDF, DOCX and PPTX text and presentation notes; teacher feedback from Inbox | Verify format separately; PDF visual/OCR, images and layout fidelity were not fully verified |
| Cloud SSO/MFA recovery | New pinned Canvas profile saved; login closed; a separate browser read restored session | Preserve new save/read/close timestamps rather than quoting an old healthy record |
| Original pending task | Persisted arguments resumed after login; task moved from owner action to partial resource | Check resource URL, stage, task ID and actual returned completeness |
| Password/push automation | Fixed known forms and the school's combined push-method selector executed; challenge detected | UI/phone delivery needs owner evidence; challenge detection alone is not delivery |
| Independent API during browser failure | API continued during actual browser quota/login problems | Do not revoke real credentials to simulate a fault; label route isolation vs real outage separately |
| Private course index | Stored browser provenance/read time and found previously read material | Not an exhaustive inventory of all visible Canvas material |
| Site backup endpoint | Authenticated direct query path bypassed MCP transport | It still shares Site hosting and identity |
| Mac off | No local runtime/tunnel dependency in architecture; shutdown test remained not tested at owner's choice | Require actual shutdown test if promised to a new user |

The later successful source-case login window occupied roughly 55 seconds; the restored read roughly 5.5 seconds, with provider NormalClosure. An earlier unattended login consumed its entire four-minute window. These are observations, not latency or cost guarantees.

## Known limits to keep in the answer

- Dynamic activities remained `Loading Activities…`; visible overview prose was read but overall page coverage remained partial.
- A file-directory API 403 also had a legitimate browser rejection. Browser fallback did not widen permission.
- A pending-review essay submission exposed questions but omitted answers; events were 403. No quiz result view was opened to force access or change seen-results state.
- LTI parent pages did not establish inner content, launch authorization or video transcript coverage. Public document exports do not establish Google login support.
- Cloudflare free capacity sometimes rejected new instances. Never promise unlimited free daily browsing or permanent SSO.
- Backend metadata intentionally leaves phone delivery/display unverified unless the owner's real observation supports it.

## Minimal real acceptance matrix

Before login, prepare a known permitted page/task and ensure the owner is actually ready to approve MFA. At most one fresh login plus one justified retry; any 429 stops acquisition immediately.

1. Private ping invoked from ordinary Chat, then iPhone.
2. API real courses, one module, complete page body, one assignment/due/submission state; filenames and links from real discovery.
3. Owner authenticates the **same cloud browser**, profile ID matches, new encrypted save and close succeed.
4. New browser instance restores saved state, reads the known resource and closes; prior task arguments resume once.
5. API works while browser is unavailable; browser works without API discovery. Record denied resources without bypass.
6. Real PDF/DOCX/PPTX and non-empty teacher feedback, each marked full/partial/unsupported with original links and read times.
7. Owner phone observes number/request and completes MFA; record human observation separately from browser detection. Do not capture numbers/passwords.
8. Mac-off and restart persistence only PASS when actually exercised; architecture/source tests are separate evidence.

The sanitized starter's offline checks verify 63 engineering invariants after the v43 update. They use fictional data, never provision cloud services or authenticate a school. Passing them is not a successful new student's connection. For current quota values/reset distinctions use [official limits](https://developers.cloudflare.com/browser-run/limits/), not source-case timestamps.


## v43 integration evidence, 2026-10-29

The original owner-private Site and separately deployed browser Worker were updated from recovered authoritative source, preserving the MCP identity, Token, index and encrypted state. Production deployment succeeded; a post-deployment MCP API query still returned real courses. This establishes deployment and API regression, not full third-party access.

- Generic Student Portal: the actual course page navigation returned HTTP 403 before SRES content could be read. Do not infer whether this is school permission, session expiry or another restriction solely from that response.
- Selected PDF: both API download paths returned HTTP 406. The independent browser download attempt stopped because it could not confirm the owner profile; no PDF bytes or extracted body were obtained. The follow-up diagnostic distinguishes identity-check HTTP rejection from proven SSO expiry.
- The legacy report lookup remained callable and returned its normal expired-cache state; no new grade-view navigation was used as a regression test.
- PebblePad needs a verified separately authenticated owner-workspace adapter. Notion needs an eligible request-scoped Site binding; a connector installed in the client is not such a binding. Both remain explicitly unconnected.
- This update did not repeat phone login, MFA or Mac-off acceptance. Earlier phone evidence does not prove new source coverage.

See [universal sources](UNIVERSAL-SOURCES.md) for wiring and stopping conditions. The private production checkout passed 86 checks; the sanitized starter passed 63. These are offline engineering checks with synthetic data, not successful reads of the blocked resources.
