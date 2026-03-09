<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# search

## Purpose
搜索功能模块，提供内容和视频的全文搜索。

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `components/` | 搜索 UI 组件 |
| `constants/` | 搜索常量 |
| `hooks/` | 搜索钩子函数 |
| `schemas/` | 搜索数据验证 |
| `stores/` | 搜索状态管理 |
| `types/` | 搜索类型 |

<!-- MANUAL: -->

## Hybrid Search Flow

```mermaid
flowchart TB
    Query[User Query] -->|Input| Parser[Query Parser]
    Parser -->|Extract| Terms[Search Terms]
    Parser -->|Extract| Filters[Filters]
    Terms -->|Search| FullText[Full-Text Search]
    Terms -->|Search| VectorSearch[Vector Search]
    Filters -->|Apply| Database[(PostgreSQL)]
    FullText -->|Results| TextScores[Text Scores]
    VectorSearch -->|Results| VectorScores[Vector Scores]
    TextScores -->|Combine| Ranker[Result Ranker]
    VectorScores -->|Combine| Ranker
    Database -->|Filter| Ranker
    Ranker -->|Sort| Results[Search Results]
```

## Search Suggestion Flow

```mermaid
flowchart LR
    Input[User Typing] -->|Debounce| Suggest[Suggest Service]
    Suggest -->|Query| History[Search History]
    Suggest -->|Query| Popular[Popular Searches]
    Suggest -->|Query| AutoComplete[Auto Complete]
    History -->|Suggestions| Merge[Merge Results]
    Popular -->|Suggestions| Merge
    AutoComplete -->|Suggestions| Merge
    Merge -->|Limit| Dropdown[Suggestion Dropdown]
```
