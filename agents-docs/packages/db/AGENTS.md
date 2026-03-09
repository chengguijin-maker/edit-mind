<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# db

## Purpose
数据库工具和模型，提供 Prisma ORM 封装和数据库操作工具。

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | 服务入口 |
| `src/models/` | 数据模型 |
| `src/utils/` | 数据库工具 |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/models/` | 数据模型定义 |
| `src/utils/` | 数据库工具函数 |

<!-- MANUAL: -->

## Database Query Flow

```mermaid
flowchart LR
    Service[Application Service] -->|Import| PrismaClient[packages/db]
    PrismaClient -->|Connect| PostgreSQL[(PostgreSQL)]
    PrismaClient -->|Generate| Models[Generated Models]
    Models -->|Video| VideoModel[Video Model]
    Models -->|Scene| SceneModel[Scene Model]
    Models -->|Collection| CollectionModel[Collection Model]
    Models -->|ChatMessage| ChatModel[Chat Message Model]
```

## Migration Flow

```mermaid
flowchart TB
    Schema[schema.prisma] -->|Edit| Changes[Schema Changes]
    Changes -->|Command| Migrate[pnpm migrate dev]
    Migrate -->|Generate| SQL[SQL Migration File]
    Migrate -->|Apply| DB[(PostgreSQL)]
    Migrate -->|Record| MigrationLog[_prisma_migrations]
```
