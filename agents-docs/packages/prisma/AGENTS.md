<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# prisma

## Purpose
Prisma ORM 模式和数据库迁移定义。

## Key Files

| File | Description |
|------|-------------|
| `schema.prisma` | 数据库模式定义 |
| `migrations/` | 数据库迁移文件 |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `migrations/` | 数据库模式迁移历史 |

## For AI Agents

### Working In This Directory
- 修改 schema.prisma 后运行 `pnpm --filter prisma generate`
- 迁移使用 `pnpm --filter prisma migrate`
- 不要手动修改迁移文件

<!-- MANUAL: -->

## Schema.prisma Entity Relationships

```mermaid
flowchart TB
    User[User] -->|1:N| Video[Video]
    User -->|1:N| Chat[Chat]
    Video -->|1:N| Scene[Scene]
    Video -->|1:N| Job[Job]
    Scene -->|M:N| Collection[Collection]
    Collection -->|N:M| CollectionExport[CollectionExport]
    Chat -->|1:N| ChatMessage[ChatMessage]
    ChatMessage -->|N:1| Video
    ChatMessage -->|N:1| Scene
    User -->|1:1| Settings[Settings]
    User -->|1:N| Folder[Folder]
    Folder -->|1:N| Video
```

## Migration Lifecycle

```mermaid
flowchart LR
    Dev[Development] -->|Edit Schema| Schema[Schema Change]
    Schema -->|Create Migration| NewMigration[new migration file]
    NewMigration -->|Review| Review[Review SQL]
    Review -->|Apply| DB[(Database)]
    DB -->|Test| App[Application Test]
    App -->|Commit| Git[Git Commit]
    Git -->|Deploy| Prod[Production]
    Prod -->|Migrate| ProdDB[Production DB]
```
