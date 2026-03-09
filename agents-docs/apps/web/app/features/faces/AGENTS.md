<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# faces

## Purpose
面部识别功能模块，处理面部检测和匹配。

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `components/` | 面部 UI 组件 |
| `hooks/` | 面部钩子函数 |
| `schemas/` | 面部数据验证 |
| `services/` | 面部服务 |
| `stores/` | 面部状态管理 |

<!-- MANUAL: -->

## Face Detection Flow

```mermaid
flowchart TB
    Video[Video File] -->|Extract| Frames[Video Frames]
    Frames -->|Send| Python[Python Face Detection]
    Python -->|Detect| Faces[Detected Faces]
    Faces -->|Generate| Embeddings[Face Embeddings]
    Embeddings -->|Store| VectorDB[(Vector DB)]
    Faces -->|Store| Metadata[(PostgreSQL)]
    Metadata -->|Link| Video[Video Reference]
    VectorDB -->|Index| SearchIndex[Face Search Index]
```

## Face Matching Flow

```mermaid
flowchart LR
    Query[Face Query] -->|Embed| Vector[Face Vector]
    Vector -->|Search| Index[Vector Index]
    Index -->|Candidates| Similar[Similar Faces]
    Similar -->|Rank| Match[Best Match]
    Match -->|Found| Person[Person Entity]
    Match -->|NotFound| Unknown[Unknown Face]
    Person -->|Display| UI[Face Gallery]
```
