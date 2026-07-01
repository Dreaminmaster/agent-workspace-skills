---
name: conversation-workspace-lifecycle
description: Token-efficient workspace lifecycle management for conversation-based agents. Use only when a task involves user files, generated artifacts, code execution, project debugging, packaging, workspace cleanup, conversation deletion, or resuming previous work. Do not load for ordinary chat or simple Q&A.
version: 1.0.0
---

# Conversation Workspace Lifecycle Skill

## Purpose

This skill defines how an agent should create, use, preserve, clean, delete, and resume conversation workspaces without wasting tokens or creating unnecessary files.

Core rule:

```text
Ordinary chat does not create a workspace.
Lightweight notes create only lightweight records.
File, code, artifact, packaging, cleanup, deletion, and resume tasks use a full workspace only when needed.
```

This file is a reusable skill and reference document. It must not be permanently copied into the system prompt. Runtime should load this skill only when the workspace classifier says it is relevant.

---

## When to Use This Skill

Use this skill only when the task involves at least one of the following:

- User uploaded files.
- Reading, analyzing, modifying, converting, or generating files.
- Creating downloadable artifacts such as Markdown, PDF, DOCX, PPTX, ZIP, DMG, images, spreadsheets, reports, or code packages.
- Writing, changing, running, testing, debugging, packaging, or releasing code.
- Browser automation, screenshots, OCR, local scripts, command logs, or environment diagnostics.
- Long-running or multi-turn tasks that must be resumed later.
- Conversation deletion where related files may exist.
- Workspace cleanup, archival, trash, restore, or permanent deletion.
- Searching old workspace outputs or artifacts.

Do not use this skill for ordinary conversation, simple advice, simple explanation, simple rewriting, or short Q&A with no files, no artifacts, no code, and no persistence requirement.

---

## Minimal Runtime Prompt Rule

Keep only this short rule in the long-lived system prompt or agent bootstrap:

```text
Ordinary chat does not create a workspace. Only file, code, generated artifact, long-running task, delete, restore, archive, or cleanup requests trigger workspace policy. When triggered, load only the relevant sections of skills/conversation-workspace-lifecycle/SKILL.md.
```

Do not place the full skill text in every request context.

---

## Workspace Levels

### Level 0: No Workspace

Use Level 0 when the user is only doing ordinary chat, simple Q&A, simple advice, simple explanation, or simple rewriting, and there are no files, artifacts, code execution, or persistence requirements.

Behavior:

- Do not create a workspace.
- Do not create a manifest.
- Do not create logs, reports, temp folders, generated files, or working files.
- Do not load the full workspace lifecycle skill.
- Answer normally.

### Level 1: Lightweight Note

Use Level 1 when the user wants to preserve a short idea, prompt, plan summary, or discussion note, but there are no uploaded files, generated downloadable files, command logs, code execution, or long-running project state.

Recommended structure:

```text
workspace/
  notes/
    YYYY-MM-DD_short_title_chat_xxxxx.md
```

Optional lightweight manifest:

```json
{
  "conversation_id": "chat_xxxxx",
  "title": "Workspace design note",
  "created_at": "2026-07-01T10:20:00",
  "last_used_at": "2026-07-01T10:40:00",
  "status": "note_only",
  "workspace_level": 1,
  "files": []
}
```

Do not create the full directory tree for Level 1 unless the task later upgrades to Level 2.

### Level 2: Full Conversation Workspace

Use Level 2 when the task involves user files, generated outputs, code, command execution, packaging, debugging, browser automation, long-running state, deletion, cleanup, restore, or artifact management.

Recommended structure:

```text
workspace/
  conversations/
    YYYY-MM-DD_short_task_chat_xxxxx/
      manifest.json
      input_files/
      working_files/
      generated_files/
      reports/
      logs/
      temp/
  artifacts/
    reports/
    markdown_specs/
    dmg/
    zips/
    images/
    docs/
    code_packages/
    presentations/
    spreadsheets/
  notes/
  trash/
  index.sqlite
```

For Level 2, create subdirectories lazily. Create only the directories that the task actually needs.

---

## Lazy Directory Creation

Do not create all folders by default.

Examples:

- User uploads a PDF only: create `manifest.json` and `input_files/`.
- User uploads a PDF and asks for analysis: create `manifest.json`, `input_files/`, and `reports/`.
- User asks for analysis and a final downloadable report: add `generated_files/`.
- User asks to modify code: create `working_files/` and `logs/` as needed.
- User asks to run or debug a project: create `working_files/`, `logs/`, and `temp/` as needed.
- User asks to package an app: create the full set only if all are actually used.

Rules:

- No uploaded files means no `input_files/`.
- No generated final outputs means no `generated_files/`.
- No command execution means no `logs/`.
- No temporary processing means no `temp/`.
- No verification report means no `reports/`.
- No code or project changes means no `working_files/`.

If a workspace was created but ends empty and has no important files, no reports, no artifacts, and no resumable state, delete it or mark it as `discarded_empty`.

---

## Conversation Workspace Naming

Use human-readable and stable names:

```text
YYYY-MM-DD_short_task_chat_xxxxx
```

Examples:

```text
2026-07-01_openalice_dmg_packaging_chat_abc123
2026-07-01_harness_workspace_design_chat_def456
```

Requirements:

- Use `YYYY-MM-DD` date format.
- Derive a short task name from the user's goal.
- Include the conversation ID for uniqueness.
- Sanitize special characters.
- Keep the folder name reasonably short, preferably under 80 characters.

---

## Directory Semantics

### input_files/

Use for user-uploaded or user-provided source files.

Rules:

- Default `important=true`.
- Do not auto-delete.
- Do not overwrite without confirmation.
- Preserve versions for duplicate names.
- Record origin, time, size, and hash in `manifest.json`.

### working_files/

Use for editable copies, extracted project files, intermediate code, patches, or converted working documents.

Rules:

- Do not delete immediately when a conversation is deleted.
- Retain for a configurable period such as 30 days unless unimportant.
- Never auto-delete if `important=true`.
- Clean only after checking manifest references.

### generated_files/

Use for final generated outputs such as final reports, DOCX, PDF, PPTX, ZIP, DMG, images, fixed code packages, and submissions.

Rules:

- Default `important=true`.
- Default keep.
- Do not delete just because the conversation is deleted.
- Do not overwrite without confirmation.
- Register final outputs in the global `artifacts/` library.

### reports/

Use for execution reports, validation reports, test reports, release checklists, debug summaries, and environment diagnoses.

Rules:

- Default keep.
- Required for code, packaging, release, and high-risk workspace operations.
- Delete only with confirmation unless explicitly classified as disposable.

### logs/

Use for command outputs, build logs, test logs, browser debug logs, and diagnostic logs.

Rules:

- Retain for 7 to 30 days by default.
- Mark failure evidence as `important=true`.
- Cleanup must not delete important logs.

### temp/

Use for temporary screenshots, OCR intermediates, one-time conversions, transient downloads, and caches.

Rules:

- Safe to auto-clean.
- Prefer cleaning after task completion or conversation deletion.
- Never store final outputs here.
- Never store user-uploaded originals here.

---

## Manifest Requirements

Each Level 2 workspace must have `manifest.json`.

Minimum fields:

```json
{
  "conversation_id": "chat_xxxxx",
  "title": "OpenAlice DMG packaging",
  "created_at": "2026-07-01T10:20:00",
  "last_used_at": "2026-07-01T12:10:00",
  "status": "active",
  "workspace_level": 2,
  "workspace_path": "workspace/conversations/2026-07-01_openalice_dmg_packaging_chat_xxxxx",
  "retention_policy": "keep_outputs_30_days",
  "task_type": "packaging",
  "summary": "Build and verify a macOS DMG package.",
  "files": [],
  "artifacts": [],
  "last_task_state": {
    "status": "in_progress",
    "last_step": null,
    "next_step": null
  }
}
```

Each file entry should include:

```json
{
  "path": "generated_files/final_report.md",
  "type": "final_output",
  "origin": "agent_generated",
  "important": true,
  "delete_policy": "keep_by_default",
  "created_at": "2026-07-01T12:00:00",
  "size_bytes": 6789,
  "sha256": "..."
}
```

Supported `type` values:

- `user_uploaded`
- `user_provided`
- `working_copy`
- `modified_file`
- `final_output`
- `report`
- `log`
- `temporary`
- `cache`
- `screenshot`
- `artifact_reference`

Supported `delete_policy` values:

- `keep_until_user_deletes`
- `keep_by_default`
- `delete_after_7_days`
- `delete_after_30_days`
- `auto_delete`
- `manual_confirm_required`

---

## Global Artifact Library

Final outputs should be registered in `workspace/artifacts/`.

Example:

```text
workspace/conversations/2026-07-01_openalice_dmg_packaging_chat_xxxxx/generated_files/final_report.md
workspace/artifacts/reports/2026-07-01_openalice_final_report.md
```

Use copying, hardlinks, symlinks, or references according to platform needs, but always record source and artifact paths in the manifest.

Rules:

- Final outputs default to `important=true`.
- Deleting artifacts requires confirmation.
- Overwriting artifacts requires confirmation.
- Artifact names should contain date and short task name.
- The artifact library should be searchable from the global index.

Recommended artifact categories:

```text
artifacts/reports/
artifacts/markdown_specs/
artifacts/dmg/
artifacts/zips/
artifacts/images/
artifacts/docs/
artifacts/code_packages/
artifacts/presentations/
artifacts/spreadsheets/
```

---

## Delete, Archive, Trash, and Permanent Delete

Deleting a conversation must not immediately delete the physical workspace.

Correct behavior:

- Level 0: no workspace exists; delete conversation record only.
- Level 1: move note to archive/trash or keep under notes archive.
- Level 2: mark manifest status as `trashed` or `archived`.
- Clean `temp/` and disposable cache files.
- Retain logs according to policy.
- Retain `working_files/` for a configured period unless disposable.
- Retain `generated_files/`, `reports/`, and global artifacts by default.

Permanent deletion requires explicit user confirmation.

Before permanent deletion, show:

- Files to be deleted.
- Total size.
- Which files are user uploads.
- Which files are final outputs.
- Which files are reports.
- Which files are `important=true`.
- Whether deletion is recoverable.

Never permanently delete without confirmation.

---

## Cleanup Policy

Safe to auto-clean:

- `temp/` files.
- Cache files.
- Logs older than policy duration when `important=false`.
- Working files older than policy duration when `important=false`.
- Empty directories.
- Empty workspaces with no input files, final outputs, reports, important files, or resumable state.

Never auto-clean:

- User-uploaded input files.
- Generated final outputs.
- Reports and validation records.
- Global artifacts.
- `important=true` files.
- `manifest.json`.
- Global `index.sqlite` or `index.json`.
- User-marked retained files.

---

## Restore and Resume

When the user asks to continue previous work:

1. Resolve the conversation ID if available.
2. Otherwise search the global index by title, date, task keywords, and artifacts.
3. Read `manifest.json`.
4. Check status, files, reports, logs, generated outputs, and `last_task_state`.
5. Resume from the next reasonable step.
6. Do not create a duplicate workspace unless this is clearly a new task.
7. If the workspace is trashed, warn that the task belongs to a deleted conversation before modifying it.
8. If required files are missing, report which files are missing and how that affects continuation.

---

## Global Index

Maintain `index.sqlite` or `index.json` for lookup and cleanup.

Recommended fields:

- `conversation_id`
- `title`
- `workspace_level`
- `workspace_path`
- `created_at`
- `last_used_at`
- `status`
- `task_type`
- `artifact_count`
- `important_file_count`
- `total_size`
- `retention_policy`
- `has_input_files`
- `has_generated_files`
- `has_reports`
- `has_logs`
- `summary`

Use this index to find old tasks, list artifacts, compute disk usage, identify cleanup candidates, and preview deletion impact.

---

## Migration from Existing Workspace Behavior

If the current system already creates a workspace for every conversation, migrate safely.

First pass must be read-only:

- Count conversation folders.
- Measure folder sizes.
- Identify empty workspaces.
- Identify temp/log-only workspaces.
- Identify workspaces with input files.
- Identify workspaces with generated files.
- Identify workspaces with reports.
- Identify important files.
- Generate a migration report.

Migration rules:

- Empty workspaces may be marked `cleanup_candidate`.
- Temp/log-only workspaces may be marked `cleanup_candidate`.
- Workspaces with generated files must be preserved.
- Workspaces with user uploads must be preserved.
- Workspaces with reports should be preserved by default.
- First migration should mark and report, not physically delete.
- Physical cleanup requires user confirmation.

---

## Token-Efficient Runtime Loading

The runtime must not load this entire skill for every request.

Implement or use a lightweight classifier before loading workspace policy.

Classifier behavior:

```text
if normal_chat_or_simple_qna:
    workspace_level = 0
    create_workspace = false
    load_workspace_skill = false

elif save_short_note_only:
    workspace_level = 1
    create_lightweight_note = true
    load_workspace_skill = minimal_sections_only

elif uploaded_file_or_file_generation_or_code_task:
    workspace_level = 2
    create_workspace = true
    load_workspace_skill = relevant_sections_only

elif delete_restore_archive_or_cleanup_workspace:
    create_workspace = false
    load_workspace_skill = relevant_sections_only
```

Section loading guidance:

- Upload file: load level, input, manifest sections.
- Generate final artifact: load generated files, artifact, manifest sections.
- Delete conversation: load delete/archive/trash and confirmation sections.
- Restore task: load index, manifest, restore sections.
- Cleanup: load cleanup and important-file protection sections.
- Code/debug/package: load Level 2, working files, logs, reports, generated files, artifact sections.

Do not load the full skill for ordinary chat.

---

## Safety and Privacy

- Do not write API keys, tokens, cookies, secrets, or private keys into manifests, reports, or logs.
- Redact secrets in logs and reports.
- Do not upload workspace data to external services unless the user explicitly asks.
- Do not let one conversation read another conversation's input files unless explicitly requested.
- Use explicit references for cross-conversation reuse.
- Confirm before deleting, overwriting, moving, or publishing important files.

---

## Required Tests

At minimum, test these scenarios:

1. Ordinary chat does not create a workspace and does not load this skill.
2. Lightweight save request creates only a Level 1 note.
3. File upload creates Level 2 workspace with only manifest and input files.
4. File analysis plus final report creates reports and generated files.
5. Code debugging creates working files, logs, and reports as needed.
6. App packaging creates required Level 2 directories lazily.
7. Deleting a Level 0 conversation has no workspace side effects.
8. Deleting a Level 2 conversation preserves generated files and artifacts.
9. Permanent deletion requires a preview and explicit confirmation.
10. Restoring a task uses index and manifest state.
11. Empty accidental workspace is discarded or marked `discarded_empty`.
12. Ordinary chat repeated many times does not load this full skill or create files.
13. Cleanup never deletes `important=true`, input files, final outputs, reports, manifests, or artifacts.

---

## Acceptance Report

After implementing this skill in an agent project, produce a report covering:

- Workspace level classification.
- Lazy directory creation behavior.
- Manifest schema.
- Global index schema.
- Artifact library behavior.
- Delete/archive/trash/permanent delete behavior.
- Cleanup policy.
- Restore behavior.
- Token-efficient loading behavior.
- Old workspace migration plan.
- Tests run and results.
- Known limitations.

---

## Final Rule

This skill exists to make workspace handling safe, useful, and token-efficient.

Do not turn ordinary conversation into files. Do not turn every request into a workspace. Do not load this whole document every time. Preserve user uploads and final outputs by default. Clean temporary junk safely. Require confirmation before destructive actions.
