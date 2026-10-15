# Recreate a private Canvas integration

The starter is a sanitized copy of the implemented API/router/browser/mobile-recovery code, not a copy of any student's accounts. The source case was USYD; other schools require explicit SSO and domain-policy review.

## 1. Verify product support before development

Use the available official Sites tools/skill and current OpenAI account capabilities. Confirm an owner-private Site and private MCP/plugin can be created and installed. Test `ping` in ordinary Chat and then on iPhone. A local MCP, Sites deployment or desktop invocation alone does not establish phone support. If the requested product route is unavailable, stop and report that boundary before building infrastructure.

## 2. Prepare the new owner's configuration

Choose the new Site and browser-service HTTPS origins from actual platform results. Obtain the new student's Canvas profile ID through an authorized API read; the owner enters their Token directly in protected Secrets. Resource IDs are not passwords, but do not reuse the template's synthetic course IDs as real courses.

```bash
python3 skills/canvas-lms-study-assistant/scripts/instantiate.py \
  --output ./canvas-personal \
  --site-origin https://YOUR-SITE.chatgpt.site \
  --browser-origin https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev \
  --canvas-user-id YOUR_NUMERIC_PROFILE_ID
```

Output must be absent/empty. Arguments contain **no credentials**. Optional `--canvas-origin`, `--sso-origin` and `--account-id` are non-secret configuration. Do not point these at the source user's infrastructure. The copied `.openai/hosting.json` deliberately has no project ID: register a new owner-private Site once, then persist the exact returned ID via the supported Sites workflow. Keep or reuse an existing project ID only for that same authorized project.

The Site Worker trusts the platform's authenticated-owner header. Deploy it through authenticated owner-private Sites dispatch; do **not** expose this worker as an arbitrary public server that accepts a caller-supplied identity header. The browser worker separately requires its service bearer key and pins a single owner. Multi-user hosting is outside this starter.

## 3. Install local dependencies and run offline checks

```bash
cd canvas-personal
npm ci
npm --prefix cloud-browser ci
node --test *.test.mjs cloud-browser/*.test.mjs
npm run build
```

All included fixtures are synthetic and these commands launch no real browser. `npm run build` produces `dist/server/index.js`. Register/package/publish it using the current native Sites Worker ESM workflow; do not manually guess opaque Site IDs. No global dependency installation is needed.

## 4. Configure protected Secrets

| Host | Configuration |
|---|---|
| Site | `CANVAS_API_TOKEN`, `OWNER_EMAIL`, `BROWSER_SERVICE_URL`, `BROWSER_SERVICE_KEY` |
| Browser Worker | `SERVICE_KEY` matching Site's browser key; `STATE_KEY` (base64 32 random bytes, AES-GCM); `CANVAS_USER_ID` set to the owner's profile; `SESSION_TTL_HOURS` |
| Optional browser autofill | `SSO_USERNAME`, `SSO_PASSWORD`, `SSO_AUTOFILL_ENABLED=1`, entered by the owner only |

Generate service/encryption keys in memory and insert them directly through an authorized secret-management flow. Never print them, place them in command arguments or commit them. Keep autofill disabled unless the owner explicitly wants server-side password storage. The owner always performs MFA.

Optional Secrets Store: account-level secrets are **not** automatically Worker bindings. Add three bindings with the exact variable/secret names and that owner's store ID; the code supports asynchronous `binding.get()`. If deployment fails with code 10021, inspect the actual role/scope/binding error before retrying. Request only additional authorization that is genuinely required; do not blindly refresh Wrangler with every available scope. See [Cloudflare binding documentation](https://developers.cloudflare.com/secrets-store/integrations/workers/).

## 5. Deploy the independent browser component

Review `cloud-browser/wrangler.jsonc`, institution domains in `policy.mjs`, exact SSO origin in `autofill.mjs`, and the fixed allowed Site/service origins. Account/store IDs in the source case were removed. Token/API queries must still work when the browser service is unavailable.

```bash
cd cloud-browser
node run.mjs whoami
node run.mjs deploy
```

The wrapper confines Wrangler state/logs to a workspace `.tmp` directory. Deployment config selects Browser Run and a SQLite Durable Object, with default manual SSO and no public course data. Workers deployment is not a browser acquisition. Confirm current provider plan/limits before real tests; do not purchase/upgrade without permission.

## 6. Publish and connect the private Site

Use native owner-private Sites save/deploy operations with the exact pushed source and matching build archive. Confirm the deployed version, private access and exposed `/mcp` tools. Install the private connector into the new user's ChatGPT account. Never reuse a source user's plugin/project URL.

Keep the small MCP interface (`list_courses`, `get_course_content`, `get_assignments`, `read_file`, `get_messages`, `auth_status` and a transport ping). `channel=api|browser|auto|compare` chooses provenance without needing two user-facing connectors. Protected `/query` is a backup for MCP transport failure, but shares Site hosting/identity and is not an independent availability guarantee.

## 7. Real mobile login and task recovery

Before spending a login window, confirm the owner is ready to approve their school request. Open the private Site on the phone; **opening the Site is not MFA approval**. Use one controlled login start, at most a second when specifically justified. On 429 stop immediately and save the real error/Retry-After.

The explicit automatic-login button reuses authorized SSO where permitted, otherwise fills recognized forms and selects Okta push; unknown forms retain manual input. A phone opened before another client starts login discovers the existing window through bounded metadata checks. It polls only that window, never starts another browser or repeats password/push actions. Challenge digits remain in the owner's UI, outside MCP/status/audit/storage.

Require a new Canvas profile verification/save timestamp, confirmed remote close, then a separate restored browser read. If a pending task ID was supplied, check its persisted arguments and transition. Dynamic placeholders remain partial. Verify ordinary iPhone Chat independently and, if Mac-off operation is promised, test it with the Mac actually shut down.

## Quick failure guide

- API 401: recover/revoke Token through the owner; do not delete browser state.
- API JSON 403: actual permission denial; a Cloudflare response header alone does not prove a WAF block.
- Stored session but live login required: compare actual restore/profile results, expiry, pinned identity and encrypted-state lifecycle; do not label stored state healthy.
- Remote view disconnected: distinguish successful explicit close, expiry and provider eviction using timestamps. Never automatically restart a 4-minute window.
- `Rate limit exceeded`: preserve exact evidence; generic 429 can mean rate/capacity/quota. The explicit daily-time error is different. See [current limits](https://developers.cloudflare.com/browser-run/limits/).
- No phone number/request: verify same-owner window attachment and the owner's actual UI; backend `challenge_detected` does not prove delivery. Do not blindly resend push.
