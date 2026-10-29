# v43 universal sources

Use this when upgrading an existing private Canvas Site to multiple study sources. Start from the authoritative deployed source, not an older local checkout. Back up the saved Site version and browser Worker version independently; keep owner audience, MCP identity, Token, encrypted state keys and private index unchanged.

## Executable starter

The existing `assets/cloud-starter` now wires these modules, rather than supplying an unconnected proposal:

- `sources.mjs`: three owner-protected MCP methods: `get_source_capabilities`, `read_student_portal(course_id, report_label?, fresh?)`, `read_connected_source(provider, capability, ...)`. The protected `/query` UI lists the same methods.
- `universal/router.mjs`: at most two concurrent registry reads across separate calls; identical requests coalesce; owner-scoped, bounded five-minute cache preserves evidence time. Errors are not cached. SRES also uses an encrypted ten-minute browser-side result cache; cached content never proves live authentication.
- `cloud-browser/student-portal.mjs`: discovers the requested course's own portal iframe. It never reuses another course's fixed LTI launch UUID. Optional exact report selection opens one visible report only. Parent-page links are not the linked report's full contents.
- `files.mjs` and `cloud-browser/file-download.mjs`: existing PDF text/DOCX text and tables/PPTX text and notes extraction; one official API download fallback; independent owner-browser download when explicitly routed there. Redirects are validated; Canvas bearer headers never go to storage hosts. Browser binary envelopes stay inside the protected service-to-Site channel and never reach MCP. Files are capped at 10 MB; no OCR or embedded-code execution.

`read_connected_source` Canvas page/file currently uses the API adapter; use the existing `read_file` tool's `channel=auto|api|browser` for independent browser file fallback. SRES uses the cloud browser directly and does not require a successful API request.

The Node/Workers Playwright request API shares its context cookie jar, but runtime support and the university's response must be tested. A failed identity request must not be described as proven SSO expiry; return its HTTP code and preserve the API channel. Never expose the cookie jar or replay it to arbitrary destinations.

## Deployment invariants

The Durable Object already serializes `fetch` through its queue. New handlers must call the reader directly inside `handle`; enqueueing again waits on itself. The starter has a timeout regression test for this failure. Ordinary read policy stays unchanged; SRES permits only narrowly scoped LTI navigation for an explicit owner request, because access can be recorded by the school. Do not advertise this as idempotent or a side-effect-free generic browser.

Use the skill's normal instantiation command, install only declared local dependencies, then run:

```sh
node --test *.test.mjs cloud-browser/*.test.mjs
npm run build
```

The current sanitized starter has 63 offline checks. Existing production-specific fixed report methods should remain in the owner's project; they are intentionally not copied into this generic starter. Deploy only the reviewed integration to the existing private Site and its existing browser host, without rotating credentials or changing state namespaces.

## Registered does not mean connected

PebblePad is an owner-action interface, not an authenticated student portfolio reader. A school Canvas session does not establish PebblePad permission. A new provider needs an observed legitimate owner entry, allowed domains, bounded extraction, separate authentication as needed, and a real workspace test before marking it supported.

Notion is a delegation interface. Verify current Sites plugin eligibility and discover actual action bindings before adding a hosted connector. Never invent connector IDs or assume a client connection can be called by the Site server. Keep it `connector_required` when the binding is absent.

For every provider record source URL, original read time, channel, cache status and completeness. Test real permitted resources and exact error responses; preserve denied results. The source deployment's actual SRES 403 and attachment 406/profile-verification failure remain blockers, despite successful deployment and offline tests. No migration or broader access is implied by this extension.
