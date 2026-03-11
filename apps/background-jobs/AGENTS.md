<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-10 | Updated: 2026-03-10 -->

# apps/background-jobs

## Purpose
后台任务服务，基于 Express + BullMQ + Socket.IO。负责任务队列、WebSocket 通信和内部 API。

## Key Files

| File | Description |
|------|-------------|
| `package.json` | 应用依赖和脚本 |
| `src/index.ts` | 服务入口 |
| `src/worker.ts` | BullMQ 工作进程 |

## For AI Agents

### Working In This Directory
- 使用 BullMQ 处理任务队列
- 使用 Socket.IO 进行实时通信
- 使用 Express 提供内部 API
- 与 Python 服务通过 WebSocket 通信

<!-- MANUAL: 自定义项目说明可以添加在下方 -->
