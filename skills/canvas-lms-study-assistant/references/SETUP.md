# Connect Canvas LMS to ChatGPT: reproducible setup outline

> This document distinguishes the tested *student workflow* from infrastructure that each user must provision. Installing `SKILL.md` alone does not connect to Canvas.

## Architecture

Canvas LMS account → Canvas REST API with personal token/OAuth → Canvas MCP service → always-on HTTPS MCP endpoint / private integration → ChatGPT plugin → this study skill.

The authenticated student must have access to the Canvas items requested. API permissions, institutional policies, and any web access restrictions still apply.

## 1. Create private credentials

1. In your own Canvas account, open Account → Settings and find the Access Tokens / New Access Token controls (where your institution permits them).
2. Create the minimum necessary token or OAuth authorization.
3. Keep credentials in protected environment variables or a managed secret store. Never post a token, personal Canvas files, or `.env` in GitHub, screenshots, support chats or public logs.

Canvas API documentation: https://canvas.instructure.com/doc/api/file.oauth.html

## 2. Test the upstream open-source MCP locally

Use the latest upstream security-maintained release. As verified on 2026-10-10, the latest GitHub release was v1.14.0 (published 2026-10-08). Earlier local configurations can differ; do not infer the installed version from this guide.

```bash
mkdir canvas-mcp-test && cd canvas-mcp-test
python3 -m venv .venv
source .venv/bin/activate
python -m pip install 'canvas-mcp==1.14.0'
```

Create a local `.env` **outside version control**, using `examples/canvas.env.example` as a template:

```dotenv
CANVAS_API_URL=https://YOUR-SCHOOL.instructure.com/api/v1
CANVAS_API_TOKEN=YOUR_PRIVATE_TOKEN
```

Then validate with:

```bash
canvas-mcp-server --test
```

A passing local test confirms token/API access **on that machine only**; it does not show ChatGPT can access the server remotely.

## 3. Connect to ChatGPT

- ChatGPT requires a reachable remote MCP endpoint for the normal remote plugin flow; a local STDIO process alone is not an HTTPS server.
- Deploy an always-on MCP service or a standards-compatible HTTPS bridge on a trusted host and safeguard credentials. Check the remote MCP transport and the expected `/mcp` endpoint.
- Within a ChatGPT product/plan that supports custom MCP connections, follow its current add-custom-server flow. Add your own trusted HTTPS endpoint; review permissions; install the private connector; select it via `@` in a chat.
- ChatGPT Plugins quickstart: https://developers.openai.com/plugins/build/app-quickstart
- ChatGPT custom MCP app availability differs by plan/workspace: https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt

**Important:** A working local client such as Cherry Studio does not mean ChatGPT web/mobile is connected. Likewise, a successful `ping` to your website does not verify access to Canvas itself.

## 4. Verify real data

1. Run `list_courses` and inspect the response; it must contain real course names and IDs.
2. Run the connector's actual page-content operation on a known page; inspect returned `title` and full `body_text`/`body`.
3. Test a second content type separately (assignments or announcements) before claiming it works.
4. Confirm any promised phone or Mac-off workflow **with the development Mac fully offline**. An always-on hosting plan is not proof of a successful offline test.

## Troubleshooting

| Symptom | Interpretation / next action |
|---|---|
| Tool not found | Check the plugin installation, selected connection, tool registration and name mapping. |
| `ping` succeeds, course query fails | Transport works but the upstream API connection is not proven. Inspect the Canvas request path and authorization. |
| HTTP 401 | Confirm the token/OAuth authorization privately and Canvas domain; avoid sharing secrets in chat. |
| HTTP 403, Cloudflare, `Not Authorized` | The remote server/IP or permission path may be blocked. Review your institution's acceptable-use rules and approved access method. Do not bypass access controls. |
| Page list works but content is blank | Call the dedicated full-page-content endpoint, not just a metadata/overview tool. |
| Upcoming assignments list is empty | Inspect assignments without a due date, modules, announcements, and weekly overview pages. |
| Mac off breaks access | The runtime still depends on the local Mac or tunnel; move runtime to a separately reachable always-on service and retest. |

## Security

Upstream v1.13.0 introduced an explicit write-tool allowlist to address a security advisory. Use v1.13.0 or newer; the command above selects v1.14.0, verified as the current GitHub release on 2026-10-10. In HTTP deployments, keep write tools disabled, including unrestricted code execution; use read-only tools and check actual exposed operations. See the upstream release and security notes.

Prefer a read-only connector or explicitly restrict exposed operations. Public repos must hold **only** placeholders and instructions. Credentials and user data belong in private secrets and remain revocable. Never publish an institution's copyrighted course content in bulk.

Upstream: https://github.com/vishalsachdev/canvas-mcp