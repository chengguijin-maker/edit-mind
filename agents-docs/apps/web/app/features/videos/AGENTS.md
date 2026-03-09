<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# videos

## Purpose
视频管理功能模块，处理视频上传、索引和播放。

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `components/` | 视频 UI 组件 |
| `hooks/` | 视频钩子函数 |
| `schemas/` | 视频数据验证 |
| `services/` | 视频服务 |
| `stores/` | 视频状态管理 |
| `types/` | 视频类型 |

<!-- MANUAL: -->

## Video Index Flow

```mermaid
flowchart TB
    Upload[Video Upload] -->|Store| Storage[File Storage]
    Storage -->|Trigger| IndexJob[Index Job]
    IndexJob -->|Extract| Metadata[Metadata Extraction]
    IndexJob -->|Send| Analysis[Python Analysis]
    IndexJob -->|Generate| Embeddings[Embedding Generation]
    Analysis -->|Results| DB[(PostgreSQL)]
    Metadata -->|Info| DB
    Embeddings -->|Vectors| Chroma[(Chroma DB)]
    DB -->|Notify| WebSocket[WebSocket Update]
    WebSocket -->|Progress| UI[UI Progress]
```

## Video Playback Flow

```mermaid
flowchart LR
    User[User Click] --> Player[Video Player]
    Player -->|Request| Stream[Video Stream]
    Stream -->|Fetch| Storage[File Storage]
    Storage -->|Stream| Player
    Player -->|Track| Progress[Playback Progress]
    Progress -->|Store| DB[(PostgreSQL)]
```
