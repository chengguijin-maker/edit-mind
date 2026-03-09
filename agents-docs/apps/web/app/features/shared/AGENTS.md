<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# shared

## Purpose
共享功能和组件，在多个特性间复用。

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `components/` | 共享 UI 组件 |
| `hooks/` | 共享钩子函数 |
| `stores/` | 共享状态管理 |
| `types/` | 共享类型 |
| `utils/` | 共享工具 |

<!-- MANUAL: -->

## Shared Component Usage Flow

```mermaid
flowchart LR
    Feature1[Feature A] -->|Import| Shared[Shared Components]
    Feature2[Feature B] -->|Import| Shared
    Feature3[Feature C] -->|Import| Shared
    Shared -->|Render| Button[Button]
    Shared -->|Render| Card[Card]
    Shared -->|Render| Dialog[Dialog]
    Shared -->|Render| Input[Input]
```
