<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# vector

## Purpose
向量存储层，负责管理 Chroma 集合、场景向量写入以及相似检索所需的数据访问。

## Key Files

| File | Description |
|------|-------------|
| `src/services/client.ts` | Chroma 客户端封装 |
| `src/services/db.ts` | 向量集合读写逻辑 |
| `src/types/vector.ts` | 向量模型类型 |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/constants/` | 向量常量 |
| `src/services/` | 向量业务逻辑 |
| `src/types/` | 向量类型 |
| `src/utils/` | 向量工具 |

<!-- MANUAL: -->

## Vector Storage Architecture

```mermaid
flowchart TB
    subgraph "Chroma DB"
        Collection[Chroma Collection]
    end

    Embedding[Embedding Service] -->|Add| Collection
    Collection -->|Query| Similarity[Similarity Search]
    Collection -->|Delete| Cleanup[Vector Cleanup]

    subgraph "Data Flow"
        Video[Video Indexed] -->|Extract| Frames[Frames]
        Frames -->|Embed| Vectors[Vector Embeddings]
        Vectors -->|Store| Collection
    end

    Similarity -->|Results| SearchService[Search Service]
```

## Collection Lifecycle

```mermaid
flowchart LR
    Create[Create Collection] -->|Check| Exists[Collection Exists?]
    Exists -->|No| CreateNew[Create New]
    Exists -->|Yes| UseExisting[Use Existing]
    CreateNew -->|Add| Upsert[Upsert Vectors]
    UseExisting -->|Add| Upsert
    Upsert -->|Query| GetNearest[k-NN Query]
    GetNearest -->|Results| Return[Return Results]
```
