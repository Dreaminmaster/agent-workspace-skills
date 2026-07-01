# Hermes Install Instructions

Use this guide to install the workspace lifecycle skill into Hermes or a Harness-style local agent.

Repository:

```text
https://github.com/Dreaminmaster/agent-workspace-skills.git
```

## 1. Clone the Skill Repository

```bash
git clone https://github.com/Dreaminmaster/agent-workspace-skills.git
```

If Hermes has a dedicated skills directory, copy or link the skill:

```bash
mkdir -p ./skills
cp -R agent-workspace-skills/skills/conversation-workspace-lifecycle ./skills/
```

Or use a symlink during development:

```bash
ln -s "$(pwd)/agent-workspace-skills/skills/conversation-workspace-lifecycle" ./skills/conversation-workspace-lifecycle
```

## 2. Register the Skill

Register this file as a skill:

```text
skills/conversation-workspace-lifecycle/SKILL.md
```

Do not copy the full `SKILL.md` into the permanent system prompt.

## 3. Keep Only the Short Runtime Rule

The long-lived Hermes prompt should only keep this short rule:

```text
Ordinary chat does not create a workspace. Only file, code, generated artifact, long-running task, delete, restore, archive, or cleanup requests trigger workspace policy. When triggered, load only the relevant sections of skills/conversation-workspace-lifecycle/SKILL.md.
```

## 4. Add a Lightweight Classifier

Before each request, Hermes should classify the task:

```text
Level 0: normal chat or simple Q&A.
- Do not create workspace.
- Do not load workspace lifecycle skill.

Level 1: user explicitly asks to save a short note, plan, prompt, or idea.
- Create lightweight note only.

Level 2: files, code, generated artifacts, debugging, packaging, delete, restore, cleanup, or long-running task state.
- Load only the relevant workspace lifecycle skill sections.
- Create workspace lazily.
```

## 5. Required Behavior Checks

After installing, test these cases:

```text
普通聊天：不创建 workspace，不加载完整 skill。
保存简短想法：只创建 Level 1 note。
上传文件：创建 Level 2 workspace，只创建 manifest 和 input_files。
生成最终产物：保存到 generated_files，并登记 artifacts。
删除对话：不直接删除最终产物。
彻底删除：必须先展示删除预览并要求确认。
清理 workspace：不能删除 important=true、用户上传文件、最终产物、reports、manifest、index。
```

## 6. Acceptance Report Hermes Should Produce

Ask Hermes to output:

```text
1. Skill installation path.
2. Long-lived prompt short rule.
3. Workspace classifier logic.
4. Level 0 ordinary chat test result.
5. Level 1 note test result.
6. Level 2 file/artifact test result.
7. Delete and restore behavior test result.
8. Cleanup protection test result.
9. Confirmation behavior for permanent deletion.
10. Any limitations or missing tool permissions.
```
