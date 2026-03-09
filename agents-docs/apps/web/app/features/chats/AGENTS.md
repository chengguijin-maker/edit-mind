<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# chats

## Purpose
聊天功能模块，支持对话式视频编辑和查询。

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `components/` | 聊天 UI 组件 |
| `hooks/` | 聊天钩子函数 |
| `plugins/` | 聊天插件 |
| `schemas/` | 消息验证 |
| `services/` | 聊天服务 |
| `stores/` | 聊天状态管理 |
| `types/` | 聊天类型 |
| `utils/` | 聊天工具 |

<!-- MANUAL: -->

## Chat Message Flow

```mermaid
flowchart TB
    User[User Input] -->|Submit| Hook[useChat Hook]
    Hook -->|Validate| Schema[Chat Schema]
    Schema -->|Send| Service[Chat Service]
    Service -->|API Call| BackgroundJobs[Background Jobs]
    BackgroundJobs -->|Stream| Service
    Service -->|Update| Store[Chat Store]
    Store -->|Render| Components[Chat Components]
    Components -->|Plugins| Plugins[Chat Plugins]
```

## Plugin Architecture

```mermaid
flowchart LR
    Message[Chat Message] -->|Parse| Router[Plugin Router]
    Router -->|Video Query| VideoPlugin[Video Plugin]
    Router -->|Collection Query| CollectionPlugin[Collection Plugin]
    Router -->|General Chat| GeneralPlugin[General Plugin]
    VideoPlugin -->|Response| Aggregator
    CollectionPlugin -->|Response| Aggregator
    GeneralPlugin -->|Response| Aggregator
    Aggregator -->|Unified| Message
```
