<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# settings

## Purpose
设置功能模块，管理系统和用户配置。

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `components/` | 设置 UI 组件 |

<!-- MANUAL: -->

## Settings Management Flow

```mermaid
flowchart TB
    User[User Action] -->|Open| Panel[Settings Panel]
    Panel -->|Load| Config[User Config]
    Config -->|Fetch| DB[(PostgreSQL)]
    Panel -->|Category| General[General Settings]
    Panel -->|Category| Video[Video Settings]
    Panel -->|Category| AI[AI Settings]
    Panel -->|Category| System[System Settings]
    General -->|Save| Update[Update Config]
    Video -->|Save| Update
    AI -->|Save| Update
    System -->|Save| Update
    Update -->|Store| DB
    Update -->|Apply| Runtime[Runtime Apply]
```

## Configuration Sync Flow

```mermaid
flowchart LR
    Change[Config Change] -->|Validate| Schema[Config Schema]
    Schema -->|Apply| Services[Affected Services]
    Services -->|Restart| Python[Python Services]
    Services -->|Reload| Web[Web Config]
    Python -->|Confirm| DB[(PostgreSQL)]
    Web -->|Confirm| DB
    DB -->|Persist| Storage[Config Storage]
```
