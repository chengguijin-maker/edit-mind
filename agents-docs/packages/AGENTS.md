<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# packages

## Purpose
Monorepo 的共享库层。这里包含数据库访问、搜索、嵌入、AI、媒体处理、UI 组件以及跨应用共享的类型和服务。

## Key Files

| File | Description |
|------|-------------|
| `ai/src/services/modelRouter.ts` | AI 模型路由入口 |
| `chat/src/index.ts` | 聊天功能核心 |
| `db/src/index.ts` | 数据库工具 |
| `embedding-core/src/index.ts` | 文本嵌入入口 |
| `prisma/schema.prisma` | 数据模型定义 |
| `shared/src/services/pythonService.ts` | Node 到 Python 服务的客户端 |
| `ui/src/index.ts` | UI 组件导出入口 |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `ai/` | AI/LLM 集成服务 |
| `chat/` | 聊天功能核心 |
| `db/` | 数据库工具 |
| `embedding-core/` | 嵌入核心服务 |
| `embedding-media/` | 媒体嵌入服务 |
| `immich/` | Immich 集成 |
| `media-utils/` | 媒体工具 |
| `prisma/` | Prisma 模式和迁移 |
| `search/` | 搜索服务 |
| `shared/` | 共享类型和工具 |
| `smart-collections/` | 智能集合逻辑 |
| `ui/` | UI 组件库 |
| `vector/` | 向量服务 |

## For AI Agents

### Working In This Directory
- 所有包使用 TypeScript 严格模式
- 不是每个包都有 `src/index.ts`；优先查看包内真实服务入口
- 修改后需运行 `pnpm build` 验证编译

<!-- MANUAL: -->
