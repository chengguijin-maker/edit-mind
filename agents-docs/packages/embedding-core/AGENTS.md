<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# embedding-core

## Purpose
嵌入核心服务，提供媒体嵌入生成的核心功能。

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | 服务入口 |
| `src/services/` | 嵌入服务 |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/services/` | 嵌入业务逻辑 |
| `src/utils/` | 嵌入工具 |

<!-- MANUAL: -->

## Embedding Generation Flow

```mermaid
flowchart TB
    Media[Media File] -->|Extract| Frames[Video Frames]
    Media -->|Extract| Audio[Audio Track]
    Frames -->|Preprocess| Processed[Processed Frames]
    Audio -->|Preprocess| ProcessedAudio[Processed Audio]
    Processed -->|Model| VisualEmbedding[Visual Embedding Model]
    ProcessedAudio -->|Model| AudioEmbedding[Audio Embedding Model]
    VisualEmbedding -->|Vector| VisualVector[Visual Vector 512d]
    AudioEmbedding -->|Vector| AudioVector[Audio Vector 512d]
    VisualVector -->|Store| Chroma[(Chroma DB)]
    AudioVector -->|Store| Chroma
```

## Embedding Service Architecture

```mermaid
flowchart LR
    subgraph "Embedding Core"
        Generate[generateEmbedding]
        Batch[batchGenerate]
        Validate[validateVector]
    end

    Client[Client Service] --> Generate
    Client --> Batch
    Generate --> Validate
    Batch --> Validate
    Validate --> Output[Vector Output]
```
