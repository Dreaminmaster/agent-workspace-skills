# Minimal Runtime Prompt

Use this short rule in Hermes / Harness / local agent bootstrap.

Do not paste the full `SKILL.md` into every request.

```text
Ordinary chat does not create a workspace. Only file, code, generated artifact, long-running task, delete, restore, archive, or cleanup requests trigger workspace policy. When triggered, load only the relevant sections of skills/conversation-workspace-lifecycle/SKILL.md.
```

## Expanded Runtime Behavior

```text
Before responding, classify the request:

Level 0: ordinary chat, simple Q&A, simple explanation, simple advice, simple rewrite.
- Do not create workspace.
- Do not load workspace lifecycle skill.
- Answer normally.

Level 1: user explicitly asks to save a short idea, prompt, plan, or note.
- Create only lightweight note storage.
- Do not create full workspace tree.

Level 2: user uploads files, asks to generate files, modify files, run code, debug a project, package an app, preserve task state, delete a conversation with files, restore previous work, or clean workspace.
- Load only the relevant workspace lifecycle skill sections.
- Create workspace lazily.
- Preserve user uploads and final artifacts by default.
- Require confirmation before permanent deletion.
```

## What Must Not Happen

```text
Do not create workspace for every chat.
Do not create empty folders by default.
Do not load full workspace rules for ordinary chat.
Do not delete user uploads or final artifacts automatically.
Do not permanently delete anything important without confirmation.
```
