<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# search

## Purpose
搜索服务，提供混合搜索、视觉搜索、相似搜索以及搜索建议生成。

## Key Files

| File | Description |
|------|-------------|
| `src/services/index.ts` | 搜索服务导出 |
| `src/services/hybridSearch.ts` | 混合搜索实现 |
| `src/services/visualSearch.ts` | 图像/视觉搜索实现 |
| `src/services/suggestion.ts` | 搜索建议生成 |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/constants/` | 搜索常量 |
| `src/services/` | 搜索业务逻辑 |
| `src/utils/` | 搜索工具 |

<!-- MANUAL: -->

## Hybrid Search Flow

```mermaid
flowchart TB
    Query[User Query] -->|Parse| Intent[Intent Parser]
    Intent -->|Text| TextSearch[Text Search]
    Intent -->|Visual| VisualSearch[Visual Search]
    Intent -->|Similar| SimilarSearch[Similarity Search]
    TextSearch -->|BM25 + Vectors| RankFusion[Rank Fusion]
    VisualSearch -->|Embedding| Chroma[(Chroma DB)]
    SimilarSearch -->|k-NN| Chroma
    Chroma -->|Results| RankFusion
    RankFusion -->|Rerank| Final[Final Results]
    Final -->|Return| Client[Client]
```

## Search Suggestion Generation

```mermaid
flowchart LR
    Partial[Partial Input] -->|Debounce| Suggest[suggestion.ts]
    Suggest -->|History| UserHistory[User History]
    Suggest -->|Popular| PopularQueries[Popular Queries]
    Suggest -->|Collections| Available[Available Collections]
    UserHistory -->|Rank| Suggestions[Suggestion List]
    PopularQueries -->|Rank| Suggestions
    Available -->|Filter| Suggestions
    Suggestions -->|Top N| Client[Client]
```
