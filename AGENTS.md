<!-- Generated: 2026-03-10 | Updated: 2026-03-10 -->

# edit-mind

## Purpose
Edit Mind 是一个本地优先的视频索引、分析与搜索平台。使用 AI 进行视频转录、帧分析、多模型嵌入，通过 ChromaDB 实现自然语言语义搜索。完全本地运行，保护隐私，支持 Docker 部署。

## Key Files

| File | Description |
|------|-------------|
| `package.json` | 根项目配置和依赖 |
| `pnpm-workspace.yaml` | pnpm 工作区配置 |
| `turbo.json` | Turborepo 任务配置 |
| `tsconfig.json` | TypeScript 根配置 |
| `eslint.config.mjs` | ESLint 配置 |
| `.prettierrc` | Prettier 格式化配置 |
| `docker-compose.yml` | Docker 编排配置 |
| `docker-compose.cuda.yml` | CUDA 支持配置 |
| `prisma.config.ts` | Prisma ORM 配置 |
| `.env.example` | 环境变量模板 |
| `.env.system.example` | 系统环境变量模板 |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `apps/` | 应用程序入口 (见 `apps/AGENTS.md`) |
| `packages/` | 共享包和库 (见 `packages/AGENTS.md`) |
| `python/` | Python 服务和 ML 模块 (见 `python/AGENTS.md`) |
| `docker/` | Dockerfiles 和开发期 Compose 配置 (见 `docker/AGENTS.md`) |
| `agents-docs/` | 参考文档目录 (已有 AGENTS.md 层次) |
| `.github/` | GitHub 工作流和模板 (见 `.github/AGENTS.md`) |
| `.vscode/` | VSCode 编辑器设置 |

## For AI Agents

### Working In This Directory
- 使用 pnpm 作为包管理器 (`pnpm install`, `pnpm add`, `pnpm remove`)
- Monorepo 架构，使用 Turborepo 进行构建编排
- JavaScript workspace 包含 `apps/*` 和 `packages/*`
- `python/` 是独立服务树，通过 Docker 容器通信
- TypeScript 严格模式在各工作区包内启用
- 遵循 ESLint 和 Prettier 规则
- 使用 Vitest 进行测试

### Testing Requirements
- 运行测试前确保依赖已安装
- 使用 Vitest 框架进行测试
- 确保修改的代码有适当的测试覆盖

### Common Patterns
- Monorepo 架构，共享包通过 `packages/` 导入
- `apps/web/` 是 React Router 7 + Vite 应用
- `apps/background-jobs/` 是 Express + BullMQ + Socket.IO 服务
- `python/` 通过 WebSocket 协议提供服务
- Prisma ORM 用于数据库操作
- ChromaDB 用于向量存储
- Python 服务用于 AI/ML 功能

## Dependencies

### Internal
- `apps/web/` - React Router 7 前端/服务端应用
- `apps/background-jobs/` - Node.js 后台任务与内部 API 服务
- `packages/*` - 共享库和工具

### External
- **React 19.x** - UI 框架
- **React Router 7** - Web 路由与构建
- **TypeScript 5.x** - 类型安全
- **Prisma** - 数据库 ORM
- **Turborepo** - 构建工具
- **pnpm** - 包管理器
- **ChromaDB** - 向量数据库
- **BullMQ** - 消息队列
- **Socket.IO** - WebSocket 通信

## Architecture Flow

```mermaid
flowchart TB
    subgraph Frontend
        Web[apps/web<br/>React Router 7 + Vite]
    end

    subgraph Backend
        BG[apps/background-jobs<br/>Express + BullMQ + Socket.IO]
    end

    subgraph Python
        PY[python/<br/>WebSocket Services]
    end

    subgraph Packages
        PKG[packages/*<br/>Shared Libraries]
    end

    subgraph Database
        DB[(PostgreSQL + Prisma)]
        Chroma[(Chroma DB<br/>Vectors)]
        Redis[(Redis<br/>Cache)]
    end

    Web <-->|HTTP + WebSocket| BG
    BG <-->|WebSocket| PY
    BG <-->|BullMQ Jobs| BG
    Web <-->|Import| PKG
    BG <-->|Import| PKG
    PY -->|Store Results| DB
    BG -->|Embeddings| Chroma
    BG -->|Cache| Redis
```

<!-- MANUAL: 自定义项目说明可以添加在下方 -->
