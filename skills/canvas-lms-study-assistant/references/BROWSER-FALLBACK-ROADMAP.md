# Implemented browser fallback and recovery

This replaces the earlier unimplemented proposal. The sanitized starter reflects the October 2026 single-owner deployment; it does not give a new account a working connection until they provision and authenticate it. See [setup](SETUP.md) and [evidence boundaries](REPRODUCTION-NOTES.md).

```text
ordinary ChatGPT / iPhone
  -> private Site /mcp (protected /query backup)
     -> Canvas API + Token (independent primary channel)
     -> separately deployed browser Worker + Playwright
        -> encrypted Durable Object session, pending tasks and private index
        -> same-owner interactive SSO / human MFA
```

## Preserve independent channels

Browser targets can come from a known Canvas URL, course ID/page slug or saved task/index; do not require a successful API discovery first. Browser expiry must not disable API. Explicit API must not acquire Chromium or block on browser/index work. Unknown permissions remain unknown until a legitimate alternate path is tested.

Results identify channel, fetched time, cache provenance, completeness and errors. Supplementation can reuse an encrypted 10-minute browser cache with its original timestamp; forced browser/compare/live verify navigates anew. Incremental metadata refresh and empty/partial coverage caching prevent needless recrawls. A queued index write is not confirmed until queried.

## Session security and recovery

Pin browser profile to the API owner's ID before saving; AES-GCM encrypt scoped Canvas and school SSO cookies separately, with expiry/revoke. Preserve the previous record until a valid replacement is confirmed. The template caps saved state at 24 hours; this does not guarantee 24-hour school authentication. Reusing normal school SSO may legitimately skip password or MFA.

Login windows are bounded to four minutes, reused while valid, closed immediately after confirmed save and protected by an alarm. Live View/input links are short-lived credentials; deliver only to the same authenticated owner and never MCP/index/logs. Mobile input goes directly to the official browser connection and clears after sending.

Fixed optional autofill actions reserve their per-window counters before transmission. No TOTP seed, MFA approval, factor enrollment, password reset, trusted-device setting or arbitrary execution tool is provided. Unknown widget structures fall back to human operation.

### Okta selection pitfall that was actually fixed

A verify list can present **methods**, not a row named `Okta Verify`. In the tested school UI the push row had title `Get a push notification` and `.authenticator-button[data-se="okta_verify-push"] .select-factor`. Selecting that row directly produced a challenge; an extra Send push click was not necessary. Match exact same-origin verified-widget structure, never a global `Select` button. Other institutions/widget revisions may differ.

The starter also recognizes official v3 `data-se="authenticator-verify-list"`/`authenticator-button`/`authenticator-button-label` structure, but that variant was not live-verified in the source case. Normalize heading apostrophes/spacing without relaxing enrollment or origin guards. Number detection uses only fixed challenge elements and returns digits to the owner's UI; event metadata records detection, not the digits.

### Cross-device handoff

A digit rendered in a desktop Site DOM is not proof it rendered on the phone. `auth_status` supplies only non-secret pending-window expiry/opt-in/manual state. On phone load, attach to an already authorized active window through `progress`; never use `start` to synchronize status. When the phone opens before the window exists, bounded metadata discovery runs every 15 seconds for at most eight checks. Stop on quota/manual/page hide. Old stored authentication must not trigger a new task's early success; only actual `progress`/`complete` authentication resumes it.

Concurrent phone/desktop progress shares a single fixed action. Session-ID checks inside storage transactions prevent late callbacks resurrecting a deleted login record. Store audit/diagnosis separately, not by writing a stale window object back after close.

## Read-only is stronger than GET-only

Canvas HTML may update module progress; Inbox defaults may mark messages read. The implementation deliberately denies browser assignment/quiz-history/Inbox/module-item/LTI launch navigation where side effects cannot be excluded. API conversation reads set `auto_mark_as_read=false`. Do not loosen this policy to retrieve hidden quiz answers or content the school rejects.

The browser can extract visible parent-page text without covering embedded content. Separate linked documents, authorized downloads, LTI pages, video and dynamic content as independent resources. Public Google Docs exports use no school/Google credential forwarding; protected documents require their own authorization. PDF/DOCX/PPTX text extraction is not full visual/OCR/media coverage.

## Quota and availability

API remains usable during browser 429. Keep exact upstream status, provider error, Retry-After, acquisition counts and provider close reason. A generic error does not prove daily exhaustion. Compute deadlines in UTC and display the owner's time zone; don't assume a fixed Sydney offset across DST. Stop new acquisitions during persisted backoff and avoid endless retries. Current limits/pricing: [Cloudflare Browser Run](https://developers.cloudflare.com/browser-run/limits/).

Release both login and read instances in finally/expiry paths. A normal close after success is expected; `BrowserSessionEvicted`, timeout and disconnected client have different meanings. Do not extend sessions by artificial school activity. Two backend channels do not eliminate the shared Site/MCP entrance dependency.
