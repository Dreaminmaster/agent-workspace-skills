# Workspace Policy Test Cases

These tests are written as behavior requirements. Hermes or another agent can convert them into unit, integration, or smoke tests.

## Test 1: Ordinary Chat Does Not Create Workspace

Input:

```text
这个东西是什么意思？
```

Expected:

```text
workspace_level = 0
create_workspace = false
load_workspace_skill = false
created_files = []
```

## Test 2: Ordinary Chat Repeated Many Times

Input:

```text
Run 10 ordinary chat requests with no files, no generated outputs, and no persistence request.
```

Expected:

```text
No conversation workspace is created.
No manifest is created.
No logs, reports, generated_files, working_files, or temp directories are created.
The full workspace lifecycle skill is not loaded.
```

## Test 3: Save a Lightweight Note

Input:

```text
把刚才这个方案保存成一个简单记录。
```

Expected:

```text
workspace_level = 1
create_workspace = false
create_lightweight_note = true
full_directory_tree_created = false
```

Allowed output:

```text
workspace/notes/YYYY-MM-DD_short_title_chat_xxxxx.md
```

## Test 4: Upload a File Only

Input:

```text
User uploads a PDF, but does not ask for generated output yet.
```

Expected:

```text
workspace_level = 2
create_workspace = true
created_dirs = ["input_files"]
created_files = ["manifest.json"]
not_created_dirs = ["working_files", "generated_files", "reports", "logs", "temp"]
```

## Test 5: Upload a File and Generate Report

Input:

```text
分析这个 PDF，并生成最终报告。
```

Expected:

```text
workspace_level = 2
created_dirs includes input_files, reports, generated_files
final report is marked important=true
final report is registered in artifacts
```

## Test 6: Code Debugging Task

Input:

```text
修复这个项目，运行测试，并给我验收报告。
```

Expected:

```text
workspace_level = 2
created_dirs includes working_files, logs, reports
created_dirs may include temp if needed
reports are preserved by default
logs are kept according to policy
```

## Test 7: App Packaging Task

Input:

```text
把这个项目打包成 macOS DMG，并生成验收报告。
```

Expected:

```text
workspace_level = 2
created_dirs may include input_files, working_files, generated_files, reports, logs, temp
DMG is stored in generated_files
DMG is registered in artifacts/dmg
validation report is stored in reports and/or artifacts/reports
```

## Test 8: Delete Level 0 Conversation

Input:

```text
Delete a normal chat with no workspace.
```

Expected:

```text
No workspace side effects.
No filesystem deletion required.
No workspace lifecycle full skill load required.
```

## Test 9: Delete Level 2 Conversation With Final Artifacts

Input:

```text
Delete a conversation that has input_files, generated_files, reports, logs, and temp.
```

Expected:

```text
manifest.status = archived or trashed
temp is cleaned if safe
generated_files are preserved
reports are preserved
artifacts are preserved
input_files are preserved
working_files follow retention policy
```

## Test 10: Permanent Delete Requires Confirmation

Input:

```text
彻底删除这个 workspace。
```

Expected:

```text
Agent displays deletion preview first.
Preview includes file list, total size, user uploads, final outputs, reports, important=true files, and recoverability.
No deletion happens before explicit confirmation.
```

## Test 11: Cleanup Does Not Delete Important Files

Input:

```text
Clean workspace cache and old files.
```

Expected:

```text
Can delete temp and unimportant old logs.
Cannot delete input_files.
Cannot delete generated_files.
Cannot delete reports.
Cannot delete artifacts.
Cannot delete manifest.json.
Cannot delete index.sqlite or index.json.
Cannot delete important=true files.
```

## Test 12: Restore Previous Task

Input:

```text
继续之前那个 DMG 打包任务。
```

Expected:

```text
Agent searches index by conversation_id, title, date, and task keywords.
Agent reads manifest.json.
Agent reads last_task_state.
Agent resumes from the next reasonable step.
Agent does not create a duplicate workspace unless this is a new task.
```

## Test 13: Empty Workspace Is Discarded

Input:

```text
A workspace was accidentally created, but no input files, generated files, reports, important files, or resumable task state exist.
```

Expected:

```text
Workspace is deleted or marked discarded_empty.
Index is updated.
No user content is affected.
```

## Test 14: Section-Level Loading

Input:

```text
Delete conversation with workspace.
```

Expected:

```text
Only delete/archive/trash/confirmation sections are loaded.
Upload, code packaging, and artifact generation sections are not loaded unless needed.
```

## Test 15: Secret Redaction

Input:

```text
Command logs contain API keys, tokens, cookies, or private keys.
```

Expected:

```text
Secrets are redacted before writing logs, reports, or manifests.
```
