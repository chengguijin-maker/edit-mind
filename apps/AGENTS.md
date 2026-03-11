<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-10 | Updated: 2026-03-10 -->

# apps

## Purpose
应用程序目录，包含所有独立运行的应用程序。

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `web/` | Web 前端应用 (见 `web/AGENTS.md`) |
| `background-jobs/` | 后台任务服务 (见 `background-jobs/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- 每个应用是独立的工作区
- 使用 `pnpm --filter <app> <command>` 运行命令
- 应用间通过共享包通信

<!-- MANUAL: 自定义项目说明可以添加在下方 -->
