<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# folders

## Purpose
文件夹管理功能模块，组织视频和媒体文件。

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `components/` | 文件夹 UI 组件 |
| `hooks/` | 文件夹钩子函数 |
| `schemas/` | 文件夹数据验证 |
| `services/` | 文件夹服务 |
| `stores/` | 文件夹状态管理 |
| `types/` | 文件夹类型 |
| `utils/` | 文件夹工具 |

<!-- MANUAL: -->

## Folder Creation Flow

```mermaid
flowchart TB
    User[User Action] -->|Create| Form[New Folder Form]
    Form -->|Submit| Validation[Data Validation]
    Validation -->|Create| DB[(PostgreSQL)]
    DB -->|Generate| FolderId[Folder ID]
    FolderId -->|Associate| Videos[Associated Videos]
    Videos -->|Update| DB
    DB -->|Notify| WebSocket[WebSocket Update]
    WebSocket -->|Refresh| UI[UI Tree]
```

## Folder Hierarchy Flow

```mermaid
flowchart LR
    Root[Root Folder] -->|Contains| Sub1[Sub Folder 1]
    Root -->|Contains| Sub2[Sub Folder 2]
    Sub1 -->|Contains| Leaf1[Video 1]
    Sub1 -->|Contains| Leaf2[Video 2]
    Sub2 -->|Contains| Leaf3[Video 3]
    Root -.->|Breadcrumb| Nav[Navigation]
```
