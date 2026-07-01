# Agent Workspace Skills

Reusable skills for Harness, Hermes, Codex-style local agents, and other AI execution systems.

This repository is intentionally separate from product repositories. It stores reusable agent skills that can be downloaded, installed, copied, or referenced by different agent projects without polluting the main application codebase.

## Included Skills

### conversation-workspace-lifecycle

Path:

```text
skills/conversation-workspace-lifecycle/SKILL.md
```

Purpose:

- Prevent ordinary chat from creating unnecessary workspace files.
- Create lightweight notes only when the user explicitly asks to preserve a short idea.
- Create full conversation workspaces only for files, code, artifacts, debugging, packaging, cleanup, deletion, restore, or long-running tasks.
- Preserve user-uploaded files and final artifacts by default.
- Clean temporary files safely.
- Require confirmation before destructive deletion.
- Avoid loading long workspace rules into every request context.

Core principle:

```text
Long rules are for development and skills. Short rules are for runtime.
Ordinary chat does not create a workspace.
Workspace policy is loaded only when the task needs it.
```

## Recommended Layout

```text
agent-workspace-skills/
  README.md
  skills/
    conversation-workspace-lifecycle/
      SKILL.md
  examples/
    hermes-install.md
    minimal-runtime-prompt.md
  tests/
    workspace-policy-test-cases.md
```

## How Hermes Should Use This Repository

Hermes should not paste the full skill into every prompt.

Instead:

1. Clone or download this repository.
2. Register `skills/conversation-workspace-lifecycle/SKILL.md` as a skill.
3. Keep only the short runtime trigger rule in the long-lived system prompt.
4. Load the skill only when the request involves files, code, generated artifacts, deletion, restore, cleanup, packaging, or long-running task state.
5. For ordinary chat, do not load this skill and do not create a workspace.

See:

```text
examples/hermes-install.md
examples/minimal-runtime-prompt.md
```

## Safety Rule

Do not auto-delete user uploads, final generated files, reports, artifacts, manifests, indexes, or files marked `important=true`.

Permanent deletion must require a preview and explicit user confirmation.
