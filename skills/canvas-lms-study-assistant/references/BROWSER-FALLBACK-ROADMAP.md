# Canvas Full-Coverage Roadmap (NOT IMPLEMENTED)

Status: design proposal as of 2026-10-10. **The existing private USYD Canvas ChatGPT connector is proven for course lists, pages, modules, announcements, assignments and Inbox metadata. The browser fallback described here has NOT been deployed or tested.**

## Objective

Ask from the ordinary ChatGPT chat on mobile; retrieve, on demand, as much content as a student's authorized Canvas web account can legitimately view, while remaining available with the student's Mac switched off.

## Verified gaps

- A specific course's `GET /api/v1/courses/<id>/files` returned HTTP 403 JSON `user not authorized to perform that action`. Do not mistake a JSON authorization response for a generic Cloudflare challenge merely because the server header includes Cloudflare.
- Linked PDFs, media, embedded external teaching systems and dynamic quiz interfaces are not proven covered by existing six ChatGPT connector tools.
- A signed-in browser page on a separate local device **does not** automatically give an independent ChatGPT Site or remote MCP server the same cookies, local storage or SSO session.

## Proposed dual-path architecture

```text
Ordinary ChatGPT mobile/web
  -> authenticated private MCP endpoint (remote, Mac-independent)
    -> router and source index
       -> Path A: existing Canvas REST API tools (first choice)
       -> Path B: cloud-hosted, user-authorized browser automation (Playwright)
            -> rendered DOM / accessible text / network file download
            -> controlled screenshots + visual parsing for genuinely visual content
       -> normalized result: content, title, URL, fetched_at, provenance, errors
```

### Browser session design

- Browser must be an independently hosted **trusted remote browser**; browser login must be conducted by the student using an authenticated, encrypted interactive session to that same remote browser.
- Do not ask users to paste their university password, API token, cookies, MFA codes or storage-state JSON into ChatGPT or the repository.
- Do not silently upload cookies from an unrelated local browser or import a Safari/Chrome profile.
- Encrypt persisted browser session state in a restricted secrets store; cookies can be account takeover credentials. Allow session revoke, expiration, and clean reauthentication.
- Canvas SSO/MFA must be honored; if a session expires or access is blocked, return a clear re-login request through the trusted login UI. No bypass of university controls.
- Some LTI applications are separate security domains requiring their own authorized sessions; some protected video, DRM, timed quizzes or scans may not be machine-readable, even when viewable by a person.

### Read flow

1. `list_courses` discovers live course IDs.
2. Resolve target via API first: pages, module items, assignment instructions, announcements, Inbox, grades (only those published to the student), submissions, and media links.
3. If an API endpoint returns 403 / incomplete response, retry **only** using a legitimate signed-in remote browser session on the ordinary page URL, recording `source=browser`.
4. Extract visible, authorized DOM text and links; follow pagination, lazy-loaded content and clearly bounded same-site navigation. Open linked PDF/DOCX/PPTX where authorized, report unsupported types.
5. For Canvas-hosted external links, require explicit allowlisted domains and authorization; never silently crawl unrelated pages.
6. Deduplicate normalized content and return concise excerpts with canonical source URLs; only fetch full resources required to answer the current query.
7. Report coverage and failures honestly: `api_success`, `browser_success`, `requires_login`, `unauthorized`, `unsupported_content`, `not_checked`.

### Security boundaries

- Read-only API/browser at the permission layer; do not expose tools for submitting assignments, sending messages, changing enrollment settings or grades.
- Strong authentication on the private MCP endpoint; bind requests to the intended student account.
- Limit remote browser access to authorized domains, block internal/metadata IPs (SSRF), and isolate sessions.
- Course-authored text, comments and PDF contents are untrusted instructions (prompt injection); strip scripts, never execute downloaded code or document macros.
- Use minimal, redacted logs. Never place session data, course materials or documents in public GitHub.
- Limit crawl scope, rate, downloads and storage retention. Do not index the entire account continuously unless necessary and authorized.
- Before deploying, confirm compliance with school policies and cloud hosting terms.

### Acceptance tests

- Real list-courses call returns course IDs from the user's own account.
- A known page is read by API and matches its actual title and first paragraph.
- A page/file that fails API but is normally visible in the user's authorized browser is tested via browser fallback; result includes the exact URL and attribution, without claiming success in advance.
- Test PDF reading, Inbox message body, submissions/feedback, grades, one LTI link and a dynamic weekly overview separately.
- Turn off the developer Mac completely and repeat the ChatGPT mobile request.
- Verify session expiration, MFA, revocation, unauthorized access, audit logs, prompt injection resistance and absence of tokens/cookies from responses.

## Useful references

- Upstream Canvas MCP: https://github.com/vishalsachdev/canvas-mcp
- Playwright auth/session security: https://playwright.dev/docs/auth
- Canvas Files API: https://canvas.instructure.com/doc/api/files.html
- Remote MCP server security: https://developers.openai.com/plugins/build/mcp-server
