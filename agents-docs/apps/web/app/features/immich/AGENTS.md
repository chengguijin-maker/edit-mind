<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# immich

## Purpose
Immich 集成功能模块，与 Immich 服务交互。

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `components/` | Immich UI 组件 |
| `hooks/` | Immich 钩子函数 |
| `services/` | Immich 服务 |
| `stores/` | Immich 状态管理 |
| `types/` | Immich 类型 |

<!-- MANUAL: -->

## Immich Integration Flow

```mermaid
flowchart TB
    User[User Action] -->|Connect| Auth[Immich Auth]
    Auth -->|API Key| ImmichAPI[Immich API]
    ImmichAPI -->|Fetch| Albums[Immich Albums]
    ImmichAPI -->|Fetch| Assets[Immich Assets]
    Albums -->|Import| Mapping[Asset Mapping]
    Assets -->|Import| Mapping
    Mapping -->|Create| LocalVideos[Local Videos]
    LocalVideos -->|Index| IndexJob[Index Job]
    IndexJob -->|Store| DB[(PostgreSQL)]
```

## Asset Sync Flow

```mermaid
flowchart LR
    Immich[Immich Server] -->|Webhook| Event[Asset Event]
    Event -->|New| Download[Download Asset]
    Event -->|Update| Sync[Sync Metadata]
    Event -->|Delete| Remove[Remove Local]
    Download -->|Process| Transcode[Transcode]
    Sync -->|Update| DB[(PostgreSQL)]
    Remove -->|Cleanup| Storage[File Storage]
```
