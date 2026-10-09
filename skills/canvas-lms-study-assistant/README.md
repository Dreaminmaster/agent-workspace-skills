# Canvas LMS Study Assistant

An original, **read-only instruction skill** for AI assistants that already have a trusted Canvas LMS MCP connection. It guides real-time course discovery, full-page reading, academic task checks, error reporting and privacy-safe verification.

**Not a Canvas API client. Not a hosted MCP server. Not a one-click ChatGPT connector.**

- Start with [SKILL.md](SKILL.md).
- Follow the [setup and troubleshooting guide](references/SETUP.md).
- Copy the [student prompt examples](references/PROMPTS.md).
- Use [credential placeholders](examples/canvas.env.example), never real secrets.

### Tested operation

A private test on 2026-10-10 returned four accessible courses and the complete body text/HTML of a week-overview page. This does **not** establish that every Canvas feature works or that a computer-off scenario has been tested.

### Credits

Upstream open-source MCP project: https://github.com/vishalsachdev/canvas-mcp

Skill format: https://agentskills.io/specification
