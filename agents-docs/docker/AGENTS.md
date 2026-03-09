<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-09 | Updated: 2026-03-09 -->

# docker

## Purpose
Dockerfiles 和 Compose 配置，分别用于本地开发、常规部署和 CUDA 版本镜像构建。

## Key Files

| File | Description |
|------|-------------|
| `docker-compose.yml` | Docker 子目录下的运行配置 |
| `docker-compose.dev.yml` | 开发环境 Compose 配置 |
| `docker-compose.cuda.yml` | CUDA 版本 Compose 配置 |
| `Dockerfile.web` | Web 镜像构建定义 |
| `Dockerfile.background-jobs` | 后台服务镜像构建定义 |
| `Dockerfile.ml` | Python/ML 镜像构建定义 |

## For AI Agents

### Working In This Directory
- 没有单一 `Dockerfile`，修改时要确认对应服务的镜像定义
- 开发环境优先使用 `docker-compose.dev.yml`
- CUDA 配置需要 NVIDIA Container Toolkit

## Docker Compose Architecture

```mermaid
flowchart TB
    subgraph "Docker Compose"
        Web[web:3000<br/>React Router 7]
        BG[background-jobs:4000<br/>Express + BullMQ]
        ML[ml:5000<br/>Python + WebSocket]
        DB[(PostgreSQL:5432)]
        Chroma[(Chroma:8000)]
        Redis[(Redis:6379)]
    end

    Web -->|API| BG
    Web -->|Import| Packages[Shared Packages]
    BG -->|WebSocket| ML
    BG -->|ORM| DB
    BG -->|Queue| Redis
    BG -->|Embeddings| Chroma
    ML -->|Store Results| DB
```

## Build Flow

```mermaid
flowchart LR
    Dockerfile[Dockerfile.*] -->|Build Context| Source[Source Code]
    Source -->|Copy| Image[Docker Image]
    Image -->|Install| Dependencies[pnpm/pip]
    Dependencies -->|Build| App[Application Build]
    App -->|Run| Container[Running Container]
    Container -->|Health Check| Monitor[Monitoring]
```

<!-- MANUAL: -->
