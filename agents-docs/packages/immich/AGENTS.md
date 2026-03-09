<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# immich

## Purpose
Immich 集成层，处理配置加密、连接测试、远程资源获取以及人脸导入相关逻辑。

## Key Files

| File | Description |
|------|-------------|
| `src/services/immich.ts` | Immich API 客户端 |
| `src/services/encryption.ts` | 集成配置加密逻辑 |
| `src/schemas/immich.ts` | Immich 配置校验 |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/constants/` | Immich 常量 |
| `src/schemas/` | 数据验证 |
| `src/services/` | Immich 业务逻辑 |
| `src/types/` | Immich 类型 |
| `src/utils/` | Immich 工具 |

<!-- MANUAL: -->

## Immich Connection Flow

```mermaid
flowchart TB
    Config[User Config] -->|Encrypt| Encrypted[Encrypted Storage]
    Config -->|Validate| Schema[Config Schema]
    Schema -->|Test| Connection[API Connection]
    Connection -->|Success| Auth[Authenticated Client]
    Connection -->|Fail| Error[Connection Error]
    Auth -->|Fetch| Albums[User Albums]
    Auth -->|Fetch| Assets[User Assets]
```

## Asset Import Flow

```mermaid
flowchart LR
    Album[Immich Album] -->|Fetch| Assets[Asset List]
    Assets -->|Download| TempDir[Temp Directory]
    TempDir -->|Move| Storage[File Storage]
    Storage -->|Create| Video[Video Entity]
    Video -->|Index| Indexer[Video Indexer]
    Indexer -->|Store| DB[(PostgreSQL)]
```
